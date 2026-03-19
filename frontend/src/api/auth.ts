import { api } from "./client";

export interface User {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
}

export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post<AuthResponse>("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>("/auth/login", data),

  me: (token: string) => api.get<User>("/auth/me", token),

  regenerateApiKey: (token: string) =>
    api.post<{ api_key: string }>("/auth/regenerate-api-key", undefined, token),
};
