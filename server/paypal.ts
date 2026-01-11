// PayPal Web Integration - Multi-Tenant Support
// Each tenant uses their own PayPal API credentials

import {
  Client,
  Environment,
  LogLevel,
  OAuthAuthorizationController,
  OrdersController,
} from "@paypal/paypal-server-sdk";
import { Request, Response } from "express";
import { decrypt } from './lib/encryption';

interface TenantPayPalClient {
  client: Client;
  ordersController: OrdersController;
  oAuthAuthorizationController: OAuthAuthorizationController;
  clientId: string;
  clientSecret: string;
}

const tenantClients = new Map<string, TenantPayPalClient>();

export function getTenantPayPalClient(
  tenantId: string,
  encryptedClientId: string,
  encryptedClientSecret: string
): TenantPayPalClient | null {
  const cacheKey = `${tenantId}`;
  
  if (tenantClients.has(cacheKey)) {
    return tenantClients.get(cacheKey)!;
  }

  try {
    const clientId = decrypt(encryptedClientId);
    const clientSecret = decrypt(encryptedClientSecret);

    if (!clientId || !clientSecret) {
      return null;
    }

    const client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: clientId,
        oAuthClientSecret: clientSecret,
      },
      timeout: 0,
      environment:
        process.env.NODE_ENV === "production"
          ? Environment.Production
          : Environment.Sandbox,
      logging: {
        logLevel: LogLevel.Info,
        logRequest: {
          logBody: true,
        },
        logResponse: {
          logHeaders: true,
        },
      },
    });

    const tenantClient: TenantPayPalClient = {
      client,
      ordersController: new OrdersController(client),
      oAuthAuthorizationController: new OAuthAuthorizationController(client),
      clientId,
      clientSecret,
    };

    tenantClients.set(cacheKey, tenantClient);
    return tenantClient;
  } catch (error) {
    console.error(`Failed to initialize PayPal for tenant ${tenantId}:`, error);
    return null;
  }
}

export function clearTenantPayPalCache(tenantId: string) {
  tenantClients.delete(tenantId);
}

export function isTenantPayPalConfigured(tenant: {
  paypalEnabled?: boolean;
  paypalClientIdEncrypted?: string | null;
  paypalClientSecretEncrypted?: string | null;
}): boolean {
  return !!(
    tenant.paypalEnabled &&
    tenant.paypalClientIdEncrypted &&
    tenant.paypalClientSecretEncrypted
  );
}

export async function getClientToken(
  tenantId: string,
  encryptedClientId: string,
  encryptedClientSecret: string
): Promise<string> {
  const tenantClient = getTenantPayPalClient(tenantId, encryptedClientId, encryptedClientSecret);
  
  if (!tenantClient) {
    throw new Error("PayPal is not configured for this organization");
  }

  const auth = Buffer.from(
    `${tenantClient.clientId}:${tenantClient.clientSecret}`,
  ).toString("base64");

  const { result } = await tenantClient.oAuthAuthorizationController.requestToken(
    {
      authorization: `Basic ${auth}`,
    },
    { intent: "sdk_init", response_type: "client_token" },
  );

  return result.accessToken!;
}

export async function createPaypalOrder(req: Request, res: Response) {
  try {
    const tenant = req.tenant;
    
    if (!tenant) {
      return res.status(400).json({ error: "Tenant not found" });
    }

    if (!isTenantPayPalConfigured(tenant)) {
      return res.status(400).json({ error: "PayPal is not configured for this organization" });
    }

    const tenantClient = getTenantPayPalClient(
      tenant.id,
      tenant.paypalClientIdEncrypted!,
      tenant.paypalClientSecretEncrypted!
    );

    if (!tenantClient) {
      return res.status(400).json({ error: "Failed to initialize PayPal" });
    }

    const { amount, currency, intent } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res
        .status(400)
        .json({
          error: "Invalid amount. Amount must be a positive number.",
        });
    }

    if (!currency) {
      return res
        .status(400)
        .json({ error: "Invalid currency. Currency is required." });
    }

    if (!intent) {
      return res
        .status(400)
        .json({ error: "Invalid intent. Intent is required." });
    }

    const collect = {
      body: {
        intent: intent,
        purchaseUnits: [
          {
            amount: {
              currencyCode: currency,
              value: amount,
            },
          },
        ],
      },
      prefer: "return=minimal",
    };

    const { body, ...httpResponse } =
      await tenantClient.ordersController.createOrder(collect);

    const jsonResponse = JSON.parse(String(body));
    const httpStatusCode = httpResponse.statusCode;

    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create PayPal order:", error);
    res.status(500).json({ error: "Failed to create order." });
  }
}

export async function capturePaypalOrder(req: Request, res: Response) {
  try {
    const tenant = req.tenant;
    
    if (!tenant) {
      return res.status(400).json({ error: "Tenant not found" });
    }

    if (!isTenantPayPalConfigured(tenant)) {
      return res.status(400).json({ error: "PayPal is not configured for this organization" });
    }

    const tenantClient = getTenantPayPalClient(
      tenant.id,
      tenant.paypalClientIdEncrypted!,
      tenant.paypalClientSecretEncrypted!
    );

    if (!tenantClient) {
      return res.status(400).json({ error: "Failed to initialize PayPal" });
    }

    const { orderID } = req.params;
    const collect = {
      id: orderID,
      prefer: "return=minimal",
    };

    const { body, ...httpResponse } =
      await tenantClient.ordersController.captureOrder(collect);

    const jsonResponse = JSON.parse(String(body));
    const httpStatusCode = httpResponse.statusCode;

    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to capture PayPal order:", error);
    res.status(500).json({ error: "Failed to capture order." });
  }
}

export async function loadPaypalDefault(req: Request, res: Response) {
  try {
    const tenant = req.tenant;
    
    if (!tenant) {
      return res.status(400).json({ error: "Tenant not found" });
    }

    if (!isTenantPayPalConfigured(tenant)) {
      return res.status(400).json({ error: "PayPal is not configured for this organization" });
    }

    const clientToken = await getClientToken(
      tenant.id,
      tenant.paypalClientIdEncrypted!,
      tenant.paypalClientSecretEncrypted!
    );
    
    res.json({
      clientToken,
    });
  } catch (error) {
    console.error("Failed to load PayPal:", error);
    res.status(500).json({ error: "Failed to initialize PayPal" });
  }
}
