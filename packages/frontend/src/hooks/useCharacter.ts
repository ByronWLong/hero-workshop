import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Character, CharacterSummary, DriveFileList, ApiResponse } from '@hero-workshop/shared';
import { api } from '../services/api';

export function useCharacterList() {
  return useQuery<DriveFileList>({
    queryKey: ['characters'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<DriveFileList>>('/characters');
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load characters');
      }
      return response.data;
    },
  });
}

export function useCharacter(fileId: string | undefined) {
  return useQuery<Character>({
    queryKey: ['characters', fileId],
    queryFn: async () => {
      if (!fileId) throw new Error('No file ID provided');
      const response = await api.get<ApiResponse<Character>>(`/characters/${fileId}`);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load character');
      }
      return response.data;
    },
    enabled: !!fileId,
  });
}

export function useCharacterSummary(fileId: string | undefined) {
  return useQuery<CharacterSummary>({
    queryKey: ['characters', fileId, 'summary'],
    queryFn: async () => {
      if (!fileId) throw new Error('No file ID provided');
      const response = await api.get<ApiResponse<CharacterSummary>>(`/characters/${fileId}/summary`);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load character summary');
      }
      return response.data;
    },
    enabled: !!fileId,
  });
}

export function useSaveCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, character }: { fileId: string; character: Character }) => {
      const response = await api.put<ApiResponse<{ fileId: string }>>(`/characters/${fileId}`, character);
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to save character');
      }
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['characters', variables.fileId] });
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      character,
      fileName,
      folderId,
    }: {
      character: Character;
      fileName: string;
      folderId?: string;
    }) => {
      const response = await api.post<ApiResponse<{ fileId: string; fileName: string }>>('/characters', {
        character,
        fileName,
        folderId,
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to create character');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fileId: string) => {
      const response = await api.delete<ApiResponse<void>>(`/characters/${fileId}`);
      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete character');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters'] });
    },
  });
}
