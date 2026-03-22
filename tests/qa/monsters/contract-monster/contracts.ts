/**
 * API Contracts
 *
 * Defines the expected response formats for all frontend API calls.
 * These contracts are validated against actual backend responses to catch
 * mismatches between frontend expectations and backend reality.
 */

export interface ContractDefinition {
  auth: boolean;
  responseType: "array" | "object" | "paginated";
  shape?: Record<string, string>;
  itemShape?: Record<string, string>;
  validate?: (response: unknown) => { valid: boolean; error?: string };
}

export const API_CONTRACTS: Record<string, ContractDefinition> = {
  // ============================================================================
  // BOTS - Frontend expects paginated responses for list endpoints
  // ============================================================================
  "GET /bots": {
    auth: false,
    responseType: "paginated",
    shape: {
      data: "array",
      total: "number",
      limit: "number",
      offset: "number",
      hasMore: "boolean",
    },
    itemShape: {
      id: "string",
      name: "string",
      endpoint: "string",
      active: "boolean",
      user_id: "string",
      created_at: "string",
    },
  },
  "GET /bots/my": {
    auth: true,
    responseType: "paginated",
    shape: {
      data: "array",
      total: "number",
      limit: "number",
      offset: "number",
      hasMore: "boolean",
    },
  },
  "GET /bots/active": {
    auth: false,
    responseType: "object",
    shape: {
      bots: "array",
      totalActive: "number",
      timestamp: "string",
    },
  },
  "GET /bots/:id": {
    auth: false,
    responseType: "object",
    shape: {
      id: "string",
      name: "string",
      endpoint: "string",
      active: "boolean",
    },
  },
  "GET /bots/:id/profile": {
    auth: false,
    responseType: "object",
    shape: {
      bot: "object",
      stats: "object",
      vpip: "number",
      pfr: "number",
      aggression: "number",
    },
  },
  "GET /bots/:id/activity": {
    auth: false,
    responseType: "object",
  },

  // ============================================================================
  // TOURNAMENTS - Frontend expects raw arrays (not paginated)
  // ============================================================================
  "GET /tournaments": {
    auth: false,
    responseType: "array",
    itemShape: {
      id: "string",
      name: "string",
      status: "string",
      buy_in: "number",
      starting_chips: "number",
    },
  },
  "GET /tournaments/:id": {
    auth: false,
    responseType: "object",
    shape: {
      id: "string",
      name: "string",
      status: "string",
    },
  },
  "GET /tournaments/:id/leaderboard": {
    auth: false,
    responseType: "array",
    itemShape: {
      position: "number",
      bot_id: "string",
      bot_name: "string",
      chips: "number",
      busted: "boolean",
    },
  },
  "GET /tournaments/:id/results": {
    auth: false,
    responseType: "array",
    itemShape: {
      bot_id: "string",
      bot_name: "string",
      finish_position: "number",
      payout: "number",
    },
  },
  "GET /tournaments/scheduled/upcoming": {
    auth: false,
    responseType: "array",
  },

  // ============================================================================
  // GAMES - Frontend expects raw arrays for tables/games
  // ============================================================================
  "GET /games": {
    auth: false,
    responseType: "array",
    itemShape: {
      id: "string",
      name: "string",
      status: "string",
    },
  },
  "GET /games/leaderboard": {
    auth: false,
    responseType: "array",
    itemShape: {
      name: "string",
      bot_id: "string",
      games_played: "number",
      total_winnings: "number",
    },
  },
  "GET /games/:id/state": {
    auth: false,
    responseType: "object",
  },
  "GET /games/:id/hands": {
    auth: true, // Requires auth - hand history is only available to participants
    responseType: "array",
  },

  // ============================================================================
  // AUTH - Standard object responses
  // ============================================================================
  "POST /auth/login": {
    auth: false,
    responseType: "object",
    shape: {
      accessToken: "string",
    },
  },
  "POST /auth/register": {
    auth: false,
    responseType: "object",
    shape: {
      message: "string",
      email: "string",
      requiresVerification: "boolean",
    },
  },
  "GET /auth/me": {
    auth: true,
    responseType: "object",
    shape: {
      id: "string",
      email: "string",
      role: "string",
    },
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================
  "GET /analytics/platform/stats": {
    auth: false,
    responseType: "object",
  },
};

/**
 * Validate a response against its contract
 */
export function validateContract(
  endpoint: string,
  response: unknown,
): { valid: boolean; errors: string[] } {
  const contract = API_CONTRACTS[endpoint];
  if (!contract) {
    return { valid: true, errors: [] }; // No contract defined, skip validation
  }

  const errors: string[] = [];

  // Check response type
  if (contract.responseType === "array") {
    if (!Array.isArray(response)) {
      errors.push(`Expected array but got ${typeof response}`);
      return { valid: false, errors };
    }
  } else if (contract.responseType === "paginated") {
    if (typeof response !== "object" || response === null) {
      errors.push(`Expected paginated object but got ${typeof response}`);
      return { valid: false, errors };
    }
    const obj = response as Record<string, unknown>;
    if (!Array.isArray(obj.data)) {
      errors.push(
        `Expected paginated response with 'data' array but got ${typeof obj.data}`,
      );
      return { valid: false, errors };
    }
    // Check required pagination fields
    if (contract.shape) {
      for (const [field, expectedType] of Object.entries(contract.shape)) {
        const actualType = Array.isArray(obj[field])
          ? "array"
          : typeof obj[field];
        if (obj[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
        } else if (actualType !== expectedType) {
          errors.push(
            `Field '${field}': expected ${expectedType}, got ${actualType}`,
          );
        }
      }
    }
  } else if (contract.responseType === "object") {
    if (
      typeof response !== "object" ||
      response === null ||
      Array.isArray(response)
    ) {
      errors.push(
        `Expected object but got ${Array.isArray(response) ? "array" : typeof response}`,
      );
      return { valid: false, errors };
    }
    // Check shape if defined
    if (contract.shape) {
      const obj = response as Record<string, unknown>;
      for (const [field, expectedType] of Object.entries(contract.shape)) {
        const actualType = Array.isArray(obj[field])
          ? "array"
          : typeof obj[field];
        if (obj[field] === undefined) {
          errors.push(`Missing required field: ${field}`);
        } else if (actualType !== expectedType) {
          errors.push(
            `Field '${field}': expected ${expectedType}, got ${actualType}`,
          );
        }
      }
    }
  }

  // Validate item shape for arrays
  if (contract.itemShape && Array.isArray(response) && response.length > 0) {
    const firstItem = response[0] as Record<string, unknown>;
    for (const [field, expectedType] of Object.entries(contract.itemShape)) {
      const actualType = Array.isArray(firstItem[field])
        ? "array"
        : typeof firstItem[field];
      if (firstItem[field] === undefined) {
        errors.push(`Array item missing field: ${field}`);
      } else if (actualType !== expectedType) {
        errors.push(
          `Array item field '${field}': expected ${expectedType}, got ${actualType}`,
        );
      }
    }
  }

  // Run custom validator if provided
  if (contract.validate) {
    const result = contract.validate(response);
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get all contracts that should be tested
 */
export function getTestableContracts(): Array<{
  endpoint: string;
  contract: ContractDefinition;
}> {
  return Object.entries(API_CONTRACTS).map(([endpoint, contract]) => ({
    endpoint,
    contract,
  }));
}

/**
 * Get contracts by auth requirement
 */
export function getPublicContracts(): Array<{
  endpoint: string;
  contract: ContractDefinition;
}> {
  return getTestableContracts().filter(({ contract }) => !contract.auth);
}

export function getAuthRequiredContracts(): Array<{
  endpoint: string;
  contract: ContractDefinition;
}> {
  return getTestableContracts().filter(({ contract }) => contract.auth);
}
