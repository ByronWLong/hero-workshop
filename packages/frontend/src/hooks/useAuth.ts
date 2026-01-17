import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserInfo, ApiResponse } from '@hero-workshop/shared';
import { api } from '../services/api';

interface AuthStatus {
  authenticated: boolean;
  user: UserInfo | null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<AuthStatus>({
    queryKey: ['auth', 'status'],
    queryFn: async () => {
      const response = await api.get<AuthStatus>('/auth/status');
      return response;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post<ApiResponse<void>>('/auth/logout', {});
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'status'], {
        authenticated: false,
        user: null,
      });
      window.location.href = '/login';
    },
  });

  return {
    user: data?.user ?? null,
    isAuthenticated: data?.authenticated ?? false,
    isLoading,
    error,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
