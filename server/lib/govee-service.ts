import { encrypt, decrypt } from './encryption';

const GOVEE_API_BASE = 'https://developer-api.govee.com/v1';

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

interface GoveeApiResponse<T> {
  code: number;
  message: string;
  data: T;
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

  private async makeRequest<T>(endpoint: string, method: string = 'GET', body?: object): Promise<T> {
    const response = await fetch(`${GOVEE_API_BASE}${endpoint}`, {
      method,
      headers: {
        'Govee-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) {
        throw new Error('Invalid Govee API key');
      }
      if (response.status === 429) {
        throw new Error('Govee API rate limit exceeded');
      }
      throw new Error(`Govee API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as GoveeApiResponse<T>;
    
    if (data.code !== 200) {
      throw new Error(`Govee API error: ${data.message}`);
    }

    return data.data;
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
    const result = await this.makeRequest<{ devices: GoveeDevice[] }>('/devices');
    return result.devices || [];
  }

  async getDeviceState(device: string, model: string): Promise<GoveeDeviceState | null> {
    try {
      const result = await this.makeRequest<GoveeDeviceState>(
        `/devices/state?device=${encodeURIComponent(device)}&model=${encodeURIComponent(model)}`
      );
      return result;
    } catch (error) {
      console.error(`Failed to get state for device ${device}:`, error);
      return null;
    }
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
