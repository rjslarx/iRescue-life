import { decrypt } from './encryption';

interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
}

interface PayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_amount: {
      currency_code: string;
      value: string;
    };
    transaction_initiation_date: string;
    transaction_updated_date: string;
    transaction_status: string;
  };
  payer_info?: {
    payer_name?: {
      given_name?: string;
      surname?: string;
    };
    email_address?: string;
  };
  shipping_info?: {
    name?: string;
  };
  cart_info?: {
    item_details?: Array<{
      item_name?: string;
      item_description?: string;
    }>;
  };
}

interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * PayPal Service - Handles PayPal REST API interactions
 */
class PayPalService {
  private baseUrl = 'https://api-m.paypal.com'; // Production URL
  // For sandbox testing: 'https://api-m.sandbox.paypal.com'

  /**
   * Get OAuth access token using client credentials
   */
  private async getAccessToken(credentials: PayPalCredentials): Promise<string> {
    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get PayPal access token: ${response.status} - ${errorText}`);
    }

    const data: PayPalAccessTokenResponse = await response.json();
    return data.access_token;
  }

  /**
   * Fetch transaction history from PayPal
   * @param startDate - Start date for transactions (YYYY-MM-DD)
   * @param endDate - End date for transactions (YYYY-MM-DD)
   */
  async fetchTransactions(
    encryptedClientId: string,
    encryptedClientSecret: string,
    startDate: string,
    endDate: string
  ): Promise<PayPalTransaction[]> {
    // Decrypt credentials
    const credentials: PayPalCredentials = {
      clientId: decrypt(encryptedClientId),
      clientSecret: decrypt(encryptedClientSecret),
    };

    // Get access token
    const accessToken = await this.getAccessToken(credentials);

    // Fetch transactions using Transactions API
    const url = `${this.baseUrl}/v1/reporting/transactions?start_date=${startDate}T00:00:00Z&end_date=${endDate}T23:59:59Z&fields=all`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch PayPal transactions: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.transaction_details || [];
  }

  /**
   * Validate PayPal credentials by attempting to get an access token
   */
  async validateCredentials(clientId: string, clientSecret: string): Promise<boolean> {
    try {
      await this.getAccessToken({ clientId, clientSecret });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse PayPal transaction into donation format
   */
  parseDonation(transaction: PayPalTransaction): {
    donorName: string;
    donorEmail: string;
    amount: number;
    date: Date;
    source: string;
  } | null {
    const { transaction_info, payer_info, shipping_info } = transaction;

    // Only process completed payments
    if (transaction_info.transaction_status !== 'S') {
      return null;
    }

    // Get donor name
    let donorName = 'Anonymous Donor';
    if (payer_info?.payer_name) {
      const { given_name, surname } = payer_info.payer_name;
      donorName = [given_name, surname].filter(Boolean).join(' ') || donorName;
    } else if (shipping_info?.name) {
      donorName = shipping_info.name;
    }

    // Get donor email
    const donorEmail = payer_info?.email_address || 'unknown@paypal.com';

    // Get amount (convert from string)
    const amount = parseFloat(transaction_info.transaction_amount.value);

    // Get date
    const date = new Date(transaction_info.transaction_initiation_date);

    return {
      donorName,
      donorEmail,
      amount,
      date,
      source: 'paypal_sync',
    };
  }
}

export const paypalService = new PayPalService();
