import { api } from "./client";

export interface User {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  createdAt: string;
}

interface UserApiResponse {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  created_at: string;
}

interface AuthApiResponse {
  user: UserApiResponse;
  access_token: string;
  accessToken?: string;
  apiKey?: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  apiKey?: string;
}

export interface RegisterResponse {
  message: string;
  email: string;
  requiresVerification: boolean;
  verificationCode?: string;
}

function transformUser(raw: UserApiResponse): User {
  return {
    id: raw.id,
    email: raw.email,
    username: raw.name,
    role: raw.role,
    createdAt: raw.created_at,
  };
}

export const authApi = {
  register: async (data: {
    email: string;
    username: string;
    password: string;
  }): Promise<RegisterResponse> => {
    const response = await api.post<RegisterResponse>("/auth/register", {
      email: data.email,
      name: data.username,
      password: data.password,
    });
    return response;
  },

  verifyEmail: async (data: {
    email: string;
    code: string;
  }): Promise<AuthResponse> => {
    const response = await api.post<AuthApiResponse>(
      "/auth/verify-email",
      data,
    );
    return {
      user: transformUser(response.user),
      access_token: response.accessToken || response.access_token,
      apiKey: response.apiKey,
    };
  },

  resendVerification: async (
    email: string,
  ): Promise<{ message: string; verificationCode?: string }> => {
    return api.post<{ message: string; verificationCode?: string }>(
      "/auth/resend-verification",
      {
        email,
      },
    );
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    return api.post<{ message: string }>("/auth/forgot-password", { email });
  },

  resetPassword: async (data: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ message: string }> => {
    return api.post<{ message: string }>("/auth/reset-password", data);
  },

  login: async (data: {
    email: string;
    password: string;
  }): Promise<AuthResponse> => {
    const response = await api.post<AuthApiResponse>("/auth/login", data);
    return {
      user: transformUser(response.user),
      access_token: response.accessToken || response.access_token,
    };
  },

  me: async (token: string): Promise<User> => {
    const raw = await api.get<UserApiResponse>("/auth/me", token);
    return transformUser(raw);
  },

  regenerateApiKey: (token: string) =>
    api.post<{ api_key: string }>("/auth/regenerate-api-key", undefined, token),
};
