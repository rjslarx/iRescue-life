import { randomUUID } from 'crypto';
import { encrypt, decrypt } from './encryption';

const GOVEE_API_BASE_LEGACY = 'https://developer-api.govee.com/v1';
const GOVEE_API_BASE_NEW = 'https://openapi.api.govee.com/router/api/v1';

interface GoveeDevice {
  device: string;
  model: string;
  deviceName: string;
  controllable: boolean;
  retrievable: boolean;
  supportCmds: string[];
}

interface GoveeDeviceState {
  device: string;
  model: string;
  properties: {
    online?: boolean;
    powerState?: string;
    brightness?: number;
    color?: { r: number; g: number; b: number };
    temperature?: number;
    humidity?: number;
  };
}

interface GoveeNewDevice {
  sku: string;
  device: string;
  deviceName: string;
  type?: string;
  capabilities?: Array<{ type: string; instance: string }>;
}

interface GoveeNewCapabilityState {
  type: string;
  instance: string;
  state?: { value: unknown };
}

interface GoveeNewStatePayload {
  sku: string;
  device: string;
  capabilities: GoveeNewCapabilityState[];
}

export class GoveeService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static encryptApiKey(apiKey: string): string {
    return encrypt(apiKey);
  }

  static decryptApiKey(encryptedApiKey: string): string {
    return decrypt(encryptedApiKey);
  }

  static async createFromEncrypted(encryptedApiKey: string): Promise<GoveeService> {
    const apiKey = GoveeService.decryptApiKey(encryptedApiKey);
    return new GoveeService(apiKey);
  }

  private async fetchJson(url: string, init: RequestInit): Promise<any> {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Govee-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error('Invalid Govee API key');
      }
      if (response.status === 429) {
        throw new Error('Govee API rate limit exceeded');
      }
      throw new Error(`Govee API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (data?.code !== undefined && data.code !== 200) {
      throw new Error(`Govee API error: ${data.message || `code ${data.code}`}`);
    }
    return data;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.getDevices();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid Govee API key')) {
        return false;
      }
      throw error;
    }
  }

  async getDevices(): Promise<GoveeDevice[]> {
    const newDevices = await this.getDevicesNewApi().catch((err) => {
      console.error('Govee new API getDevices failed, falling back to legacy:', err);
      return null;
    });

    const legacyDevices = await this.getDevicesLegacyApi().catch((err) => {
      console.error('Govee legacy API getDevices failed:', err);
      return [] as GoveeDevice[];
    });

    const merged = new Map<string, GoveeDevice>();
    for (const d of legacyDevices) {
      merged.set(`${d.device}|${d.model}`, d);
    }
    if (newDevices) {
      for (const d of newDevices) {
        merged.set(`${d.device}|${d.model}`, d);
      }
    }
    return Array.from(merged.values());
  }

  private async getDevicesLegacyApi(): Promise<GoveeDevice[]> {
    const data = await this.fetchJson(`${GOVEE_API_BASE_LEGACY}/devices`, { method: 'GET' });
    return (data?.data?.devices as GoveeDevice[]) || [];
  }

  private async getDevicesNewApi(): Promise<GoveeDevice[]> {
    const data = await this.fetchJson(`${GOVEE_API_BASE_NEW}/user/devices`, { method: 'GET' });
    const list: GoveeNewDevice[] = data?.data || [];
    return list.map((d) => ({
      device: d.device,
      model: d.sku,
      deviceName: d.deviceName,
      controllable: false,
      retrievable: true,
      supportCmds: [],
    }));
  }

  async getDeviceState(device: string, model: string): Promise<GoveeDeviceState | null> {
    try {
      const newState = await this.getDeviceStateNewApi(device, model);
      if (newState) return newState;
    } catch (error) {
      console.error(`Govee new API state failed for ${device}, trying legacy:`, error);
    }

    try {
      const data = await this.fetchJson(
        `${GOVEE_API_BASE_LEGACY}/devices/state?device=${encodeURIComponent(device)}&model=${encodeURIComponent(model)}`,
        { method: 'GET' }
      );
      return data?.data as GoveeDeviceState;
    } catch (error) {
      console.error(`Failed to get state for device ${device}:`, error);
      return null;
    }
  }

  private async getDeviceStateNewApi(device: string, model: string): Promise<GoveeDeviceState | null> {
    const data = await this.fetchJson(`${GOVEE_API_BASE_NEW}/device/state`, {
      method: 'POST',
      body: JSON.stringify({
        requestId: randomUUID(),
        payload: { sku: model, device },
      }),
    });

    const payload: GoveeNewStatePayload | undefined = data?.payload;
    if (!payload || !Array.isArray(payload.capabilities)) return null;

    const properties: GoveeDeviceState['properties'] = {};
    for (const cap of payload.capabilities) {
      const value = cap?.state?.value;
      const instance = cap?.instance;
      if (instance === 'online' && typeof value === 'boolean') {
        properties.online = value;
      } else if (instance === 'sensorTemperature' || instance === 'temperature') {
        if (typeof value === 'number') {
          properties.temperature = value;
        } else if (value && typeof value === 'object' && 'currentTemperature' in (value as any)) {
          const v = (value as any).currentTemperature;
          if (typeof v === 'number') properties.temperature = v;
        }
      } else if (instance === 'sensorHumidity' || instance === 'humidity') {
        if (typeof value === 'number') {
          properties.humidity = value;
        } else if (value && typeof value === 'object' && 'currentHumidity' in (value as any)) {
          const v = (value as any).currentHumidity;
          if (typeof v === 'number') properties.humidity = v;
        }
      }
    }

    if (properties.online === undefined) properties.online = true;

    return {
      device: payload.device,
      model: payload.sku,
      properties,
    };
  }

  extractTemperatureHumidity(state: GoveeDeviceState): {
    temperatureCelsius: number | null;
    temperatureFahrenheit: number | null;
    humidityPercent: number | null;
    isOnline: boolean;
  } {
    const props = state.properties;
    const isOnline = props.online !== false;
    
    let temperatureCelsius: number | null = null;
    let temperatureFahrenheit: number | null = null;
    let humidityPercent: number | null = null;

    if (props.temperature !== undefined) {
      temperatureCelsius = props.temperature;
      temperatureFahrenheit = (props.temperature * 9/5) + 32;
    }

    if (props.humidity !== undefined) {
      humidityPercent = props.humidity;
    }

    return {
      temperatureCelsius,
      temperatureFahrenheit,
      humidityPercent,
      isOnline,
    };
  }
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9/5) + 32;
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) * 5/9;
}

export function isTemperatureSensorModel(model: string): boolean {
  const tempSensorModels = [
    'H5179', 'H5075', 'H5074', 'H5072', 'H5071', 'H5100', 'H5101', 'H5102',
    'H5103', 'H5104', 'H5105', 'H5106', 'H5174', 'H5175', 'H5177', 'H5178',
    'H5182', 'H5183', 'H5184', 'H5185'
  ];
  return tempSensorModels.some(m => model.toUpperCase().includes(m));
}
