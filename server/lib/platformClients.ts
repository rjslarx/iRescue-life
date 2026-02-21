import { decrypt } from "./encryption";
import type { PlatformIntegration } from "@shared/schema";

/**
 * PetFinder API Client
 * Handles OAuth 2.0 authentication and API calls
 */
export class PetFinderClient {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(integration: PlatformIntegration) {
    if (!integration.clientIdEncrypted || !integration.clientSecretEncrypted) {
      throw new Error("PetFinder credentials not configured");
    }
    this.clientId = decrypt(integration.clientIdEncrypted);
    this.clientSecret = decrypt(integration.clientSecretEncrypted);
    
    // Restore existing token if valid
    if (integration.accessTokenEncrypted && integration.tokenExpiresAt) {
      const expiresAt = new Date(integration.tokenExpiresAt);
      if (expiresAt > new Date()) {
        this.accessToken = decrypt(integration.accessTokenEncrypted);
        this.tokenExpiresAt = expiresAt;
      }
    }
  }

  async ensureAuthenticated(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    // Get new access token
    const response = await fetch("https://api.petfinder.com/v2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`PetFinder OAuth failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    if (!this.accessToken) {
      throw new Error("Failed to obtain access token from PetFinder");
    }
    
    return this.accessToken;
  }

  async getOrganizations(query: string = ""): Promise<any> {
    const token = await this.ensureAuthenticated();
    const url = new URL("https://api.petfinder.com/v2/organizations");
    if (query) url.searchParams.set("query", query);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`PetFinder API error: ${response.statusText}`);
    }

    return await response.json();
  }

  // Get organization details
  async getOrganization(orgId: string): Promise<any> {
    const token = await this.ensureAuthenticated();
    const response = await fetch(
      `https://api.petfinder.com/v2/organizations/${orgId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`PetFinder API error: ${response.statusText}`);
    }

    return await response.json();
  }

  // Note: PetFinder API is READ-ONLY for v2
  // Organizations must post/update animals through their PetFinder dashboard
  // This client is for syncing organization data and checking listings
}

/**
 * RescueGroups API Client
 * HTTP/JSON API with simple authentication
 */
export class RescueGroupsClient {
  private apiKey: string;

  constructor(integration: PlatformIntegration) {
    if (!integration.clientIdEncrypted) {
      throw new Error("RescueGroups API key not configured");
    }
    this.apiKey = decrypt(integration.clientIdEncrypted);
  }

  async searchAnimals(params: {
    type?: string;
    location?: string;
    limit?: number;
  } = {}): Promise<any> {
    const url = new URL("https://api.rescuegroups.org/v5/public/animals/search");
    
    const body = {
      data: {
        filters: [] as any[],
      },
      options: {
        limit: params.limit || 50,
      },
    };

    if (params.type) {
      body.data.filters.push({
        fieldName: "species.singular",
        operation: "equals",
        criteria: params.type,
      });
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        "Authorization": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`RescueGroups API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async createAnimal(animalData: any): Promise<any> {
    const response = await fetch(
      "https://api.rescuegroups.org/v5/public/animals",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          "Authorization": this.apiKey,
        },
        body: JSON.stringify({
          data: animalData,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RescueGroups API error: ${error}`);
    }

    return await response.json();
  }

  async updateAnimal(animalId: string, animalData: any): Promise<any> {
    const response = await fetch(
      `https://api.rescuegroups.org/v5/public/animals/${animalId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/vnd.api+json",
          "Authorization": this.apiKey,
        },
        body: JSON.stringify({
          data: animalData,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RescueGroups API error: ${error}`);
    }

    return await response.json();
  }

  async deleteAnimal(animalId: string): Promise<void> {
    const response = await fetch(
      `https://api.rescuegroups.org/v5/public/animals/${animalId}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": this.apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`RescueGroups API error: ${response.statusText}`);
    }
  }
}

/**
 * Adopt-a-Pet API Client
 * Note: Adopt-a-Pet requires a partnership agreement
 * This is a basic implementation for partner API
 */
export class AdoptAPetClient {
  private apiKey: string;
  private shelterId: string;

  constructor(integration: PlatformIntegration) {
    if (!integration.clientIdEncrypted || !integration.organizationId) {
      throw new Error("Adopt-a-Pet credentials not configured");
    }
    this.apiKey = decrypt(integration.clientIdEncrypted);
    this.shelterId = integration.organizationId;
  }

  async getPets(): Promise<any> {
    const response = await fetch(
      `https://api.adoptapet.com/v1/pets?key=${this.apiKey}&shelter_id=${this.shelterId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Adopt-a-Pet API error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getPetDetails(petId: string, limited: boolean = true): Promise<any> {
    const response = await fetch(
      `https://api.adoptapet.com/v1/pet_details?key=${this.apiKey}&pet_id=${petId}&limit=${limited}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Adopt-a-Pet API error: ${response.statusText}`);
    }

    return await response.json();
  }

  // Note: Adopt-a-Pet partner API is primarily read-only
  // To add/update pets, organizations use the Adopt-a-Pet dashboard
}

/**
 * Factory function to create appropriate client based on platform
 */
export function createPlatformClient(integration: PlatformIntegration) {
  switch (integration.platform) {
    case "petfinder":
      return new PetFinderClient(integration);
    case "rescuegroups":
      return new RescueGroupsClient(integration);
    case "adoptapet":
      return new AdoptAPetClient(integration);
    default:
      throw new Error(`Unknown platform: ${integration.platform}`);
  }
}
