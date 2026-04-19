import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from './api';
import {
  LoginRequest,
  LoginResponse,
  AuthenticatedUser,
  ApiResponse,
} from '@/types/next-auth';
import { toast } from 'sonner';
import { toastStyles } from '@/lib/toast-config';

// ===== AUTHENTICATION HOOKS =====

// Login
export const useLogin = () => {
  return useMutation<LoginResponse, Error, LoginRequest>({
    mutationFn: async (request: LoginRequest) => {
      const response = await api.post<LoginResponse>('/api/auth/login', request);

      console.log('Raw response.data:', response.data);

      // Handle the actual response structure from backend
      const rawData: any = response.data;
      let loginData: any = rawData;
      let successMessage = rawData.message || 'Login successful';
      let isSuccess = rawData.success;

      // If there's a nested data property, extract it
      if (rawData.data && typeof rawData.data === 'object') {
        const nestedData: any = rawData.data;

        // Reconstruct the response with the correct structure
        loginData = {
          success: rawData.success,
          message: rawData.message,
          token: nestedData.tokens?.accessToken || nestedData.token,
          refreshToken: nestedData.tokens?.refreshToken || nestedData.refreshToken,
          user: nestedData.user,
          expiresIn: nestedData.tokens?.expiresIn
        };
      }

      console.log('Processed loginData:', {
        status: response.status,
        success: loginData.success,
        hasToken: !!loginData.token,
        hasUser: !!loginData.user,
        message: loginData.message,
        fullResponse: loginData
      });

      // Validate response structure
      if (!loginData) {
        throw new Error('No response data received from server');
      }

      if (loginData.success !== true) {
        throw new Error(loginData.message || 'Login failed');
      }

      if (!loginData.token) {
        throw new Error('No authentication token received from server');
      }

      if (!loginData.user) {
        throw new Error('No user data received from server');
      }

      // Store auth data from backend response
      console.log('Storing to localStorage:', {
        token: loginData.token?.substring(0, 20) + '...',
        user: loginData.user,
        refreshToken: loginData.refreshToken?.substring(0, 20) + '...'
      });

      localStorage.setItem('token', loginData.token);
      localStorage.setItem('user', JSON.stringify(loginData.user));
      localStorage.setItem('refreshToken', loginData.refreshToken);

      toast.success(loginData.message || 'Login successful', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });

      return loginData;
    },
    onError: (error: unknown) => {
      console.error('Login request failed:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Login failed';

      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// Logout
export const useLogout = () => {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await api.post('/api/auth/logout');
      } catch (error) {
        // Even if logout fails on server, clear local storage
        console.warn('Logout API call failed, but clearing local storage:', error);
      } finally {
        // Always clear local storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('theme');
      }
    },
    onSuccess: () => {
      toast.success('Logged out successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      console.error('Logout mutation error:', error);
      // Still show success since we cleared local storage
      toast.success('Logged out successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
  });
};

// Get current user
export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; user: AuthenticatedUser }>('/api/auth/me');

      console.log('useCurrentUser response:', data);

      if (!data.success) {
        throw new Error('Failed to fetch current user');
      }

      // Ensure user has all required fields
      const user = data.user as any;

      // Merge with stored user data to preserve timetableAccess if not in API response
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const parsedStoredUser = JSON.parse(storedUser);
          // If API response doesn't have timetableAccess but stored user does, use stored one
          if (!user.timetableAccess && parsedStoredUser.timetableAccess) {
            user.timetableAccess = parsedStoredUser.timetableAccess;
          }
        } catch (error) {
          console.warn('Failed to parse stored user data:', error);
        }
      }

      console.log('Processed user data:', user);
      return user;
    },
    enabled: typeof window !== 'undefined' && !!localStorage.getItem('token'), // Only run on client if token exists
    retry: false, // Don't retry on auth failures
  });
};

export const useChangePassword = () => {
  return useMutation<ApiResponse<void>, Error, { currentPassword: string; newPassword: string }>({
    mutationFn: async (request) => {
      const response = await api.post<ApiResponse<void>>('/api/auth/change-password', request);
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to change password');
      }
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Password changed successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      console.error('Change password error:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to change password';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
}

// Forgot password
export const useForgotPassword = () => {
  return useMutation<{ success: boolean; message: string }, Error, { email: string }>({
    mutationFn: async ({ email }) => {
      const response = await api.post<{ success: boolean; message: string }>('/api/auth/forgot-password', { email });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to send reset email');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Password reset email sent!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      console.error('Forgot password error:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to send reset email';

      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// Single user invite
export const useInviteUser = () => {
  return useMutation<
    ApiResponse<{
      id: string;
      username: string;
      email: string;
      role: string;
    }>,
    Error,
    {
      username: string;
      email: string;
      role?: 'ADMIN' | 'SUPER_ADMIN' | 'STUDENT' | 'INSTRUCTOR';
      program?: string;
      level?: string;
      startYear?: number;
      endYear?: number;
      phone?: string;
      address?: string;
    }
  >({
    mutationFn: async (request) => {
      const response = await api.post<ApiResponse<{
        id: string;
        username: string;
        email: string;
        role: string;
      }>>('/api/auth/invite', request);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to invite user');
      }

      return response.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'User invited successfully! Credentials sent via email.', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      console.error('Invite user error:', error);
      const axiosError = error as { response?: { data?: { message?: string; error?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to invite user';
      const errorCode = axiosError.response?.data?.error;

      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// Bulk user invite
export const useBulkInviteUsers = () => {
  return useMutation<
    ApiResponse<{
      results: Array<{
        email: string;
        username: string;
        status: 'CREATED' | 'SKIPPED' | 'FAILED';
        reason?: string;
      }>;
    }>,
    Error,
    {
      users: Array<{
        username: string;
        email: string;
        role?: 'ADMIN' | 'SUPER_ADMIN' | 'STUDENT' | 'INSTRUCTOR';
        program?: string;
        level?: string;
        startYear?: number;
        endYear?: number;
        phone?: string;
        address?: string;
      }>;
    }
  >({
    mutationFn: async (request) => {
      const response = await api.post<ApiResponse<{
        results: Array<{
          email: string;
          username: string;
          status: 'CREATED' | 'SKIPPED' | 'FAILED';
          reason?: string;
        }>;
      }>>('/api/auth/bulk-invite', request);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to process bulk invite');
      }

      return response.data;
    },
    onSuccess: (data) => {
      const results = data.data?.results || [];
      const created = results.filter(r => r.status === 'CREATED').length;
      const skipped = results.filter(r => r.status === 'SKIPPED').length;
      const failed = results.filter(r => r.status === 'FAILED').length;

      let message = `Bulk invite completed: ${created} created`;
      if (skipped > 0) message += `, ${skipped} skipped`;
      if (failed > 0) message += `, ${failed} failed`;

      toast.success(message, {
        position: toastStyles.success.position,
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
      });
    },
    onError: (error: unknown) => {
      console.error('Bulk invite error:', error);
      const axiosError = error as { response?: { data?: { message?: string; error?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to process bulk invite';
      const errorCode = axiosError.response?.data?.error;

      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== UTILITY FUNCTIONS =====

// Check if user is authenticated
export const useIsAuthenticated = () => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('token');
};

// Get stored user data
export const useStoredUser = () => {
  if (typeof window === 'undefined') return null as unknown as AuthenticatedUser | null;
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) as AuthenticatedUser : null;
};

// ===== DEPARTMENTS HOOKS =====

// Get all levels
export function useLevels(params?: { page?: number; limit?: number; search?: string; departmentId?: string; isActive?: boolean }) {
  return useQuery({
    queryKey: ['levels', params],
    queryFn: async () => {
      const { data } = await api.get('/api/admin/levels', { params });
      return data;
    },
  });
}

// Get single level
export function useLevel(id: string) {
  return useQuery({
    queryKey: ['levels', id],
    queryFn: async () => {
      const { data } = await api.get(`/api/admin/levels/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// Create level
export function useCreateLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (levelData: any) => {
      const { data } = await api.post('/api/admin/levels', levelData);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Level created successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create level';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
}

// Update level
export function useUpdateLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: responseData } = await api.put(`/api/admin/levels/${id}`, data);
      return responseData;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Level updated successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update level';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
}

// Delete level
export function useDeleteLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/api/admin/levels/${id}`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Level deleted successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['levels'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete level';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
}

// ===== DEPARTMENTS HOOKS =====

export const useDepartments = (params?: { page?: number; limit?: number; search?: string; facultyId?: string; isActive?: boolean }) => {
  return useQuery({
    queryKey: ['departments', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/admin/departments', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch departments');
      }
      return data;
    },
  });
};

export const useSemesters = (params?: { isCurrent?: boolean; academicYearId?: string }) => {
  return useQuery({
    queryKey: ['semesters', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/semesters', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch semesters');
      }
      return data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
};

export const useBulkCreateSemesters = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (semesters: any[]) => {
      const { data } = await api.post<ApiResponse<any>>(
        '/api/semesters/bulk',
        { semesters }
      );
      return data;
    },
    onSuccess: (data) => {
      // Invalidate semesters cache
      queryClient.invalidateQueries({ queryKey: ['semesters'] });

      // Show success toast with summary
      const summary = (data as any).summary;
      if (summary) {
        toast.success(
          `${summary.created} semester(s) created successfully`,
          {
            style: toastStyles.success.style,
            duration: toastStyles.success.duration,
          }
        );
        if (summary.failed > 0) {
          toast.warning(
            `${summary.failed} semester(s) failed to create`,
            {
              style: toastStyles.warning.style,
              duration: toastStyles.warning.duration,
            }
          );
        }
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || error.message || 'Failed to create semesters';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== ACADEMIC YEARS HOOKS =====

export const useAcademicYears = (params?: { isCurrent?: boolean }) => {
  return useQuery({
    queryKey: ['academic-years', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/academic-years', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch academic years');
      }
      return data;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
};

export const useAcademicYear = (id: string) => {
  return useQuery({
    queryKey: ['academic-year', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/academic-years/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch academic year');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useCreateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (academicYearData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/academic-years', academicYearData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create academic year');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success(data.message || 'Academic year created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create academic year';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: academicYearData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/academic-years/${id}`, academicYearData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update academic year');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      queryClient.invalidateQueries({ queryKey: ['academic-year', variables.id] });
      toast.success(data.message || 'Academic year updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update academic year';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteAcademicYear = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/academic-years/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete academic year');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      toast.success('Academic year deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete academic year';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDepartment = (id: string) => {
  return useQuery({
    queryKey: ['department', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/departments/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch department');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useCreateDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (departmentData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/departments', departmentData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create department');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(data.message || 'Department created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create department';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: departmentData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/departments/${id}`, departmentData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update department');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['department', variables.id] });
      toast.success(data.message || 'Department updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update department';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/departments/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete department');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete department';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== COURSES HOOKS =====

export const useCourses = (params?: { page?: number; limit?: number; search?: string; departmentId?: string; facultyId?: string; semesterId?: string; instructorId?: string; intakeId?: string; isActive?: boolean }) => {
  return useQuery({
    queryKey: ['courses', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/admin/courses', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch courses');
      }
      return data;
    },
  });
};

export const useCourse = (id: string) => {
  return useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/courses/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch course');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useCreateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (courseData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/courses', courseData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create course');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success(data.message || 'Course created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: courseData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/courses/${id}`, courseData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update course');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['course', variables.id] });
      toast.success(data.message || 'Course updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteCourse = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/courses/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete course');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success('Course deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useBulkCreateCourses = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { departmentId: string; courses: any[] }>({
    mutationFn: async ({ departmentId, courses }) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/courses/bulk', {
        departmentId,
        courses
      });
      if (!data.success) {
        throw new Error(data.message || 'Failed to bulk create courses');
      }
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success(data.message || `Successfully created ${data.summary?.created} courses!`, {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to bulk create courses';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== INSTRUCTORS HOOKS =====

export const useInstructors = (params?: { 
  page?: number; 
  limit?: number; 
  search?: string; 
  facultyId?: string; 
  departmentId?: string; 
  isActive?: boolean;
  hasProfile?: boolean;
  hasCourses?: boolean;
  hasAvailability?: boolean;
}) => {
  return useQuery({
    queryKey: ['instructors', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.facultyId) queryParams.append('facultyId', params.facultyId);
      if (params?.departmentId) queryParams.append('departmentId', params.departmentId);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
      if (params?.hasProfile !== undefined) queryParams.append('hasProfile', params.hasProfile.toString());
      if (params?.hasCourses !== undefined) queryParams.append('hasCourses', params.hasCourses.toString());
      if (params?.hasAvailability !== undefined) queryParams.append('hasAvailability', params.hasAvailability.toString());

      const { data } = await api.get<ApiResponse<any>>(`/api/admin/instructors?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch instructors');
      }
      return data;
    },
  });
};

export const useInstructor = (id: string) => {
  return useQuery({
    queryKey: ['instructor', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/instructors/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch instructor');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

/**
 * Assign room and department to an instructor
 */
export const useAssignRoomDepartment = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; departmentId: string; officeRoom?: string; employeeId?: string }>({
    mutationFn: async ({ id, departmentId, officeRoom, employeeId }) => {
      const payload: any = { departmentId };
      if (officeRoom) payload.officeRoom = officeRoom;
      if (employeeId) payload.employeeId = employeeId;

      const { data } = await api.post<ApiResponse<any>>(`/api/admin/instructors/${id}/assign-room-department`, payload);
      if (!data.success) {
        throw new Error(data.message || 'Failed to assign room and department');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['instructor', variables.id] });
      toast.success(data.message || 'Room and department assigned successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to assign room and department';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useInstructorAvailability = (id: string) => {
  return useQuery({
    queryKey: ['instructor-availability', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/instructors/${id}/availability`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch instructor availability');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useUpdateInstructorAvailability = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; availability: any[] }>({
    mutationFn: async ({ id, availability }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/instructors/${id}/availability`, { availability });
      if (!data.success) {
        throw new Error(data.message || 'Failed to update instructor availability');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['instructor-availability', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['instructor', variables.id] });
      toast.success(data.message || 'Instructor availability updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update instructor availability';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

/**
 * Get courses in a department for assignment
 */
export const useGetCoursesInDepartment = (departmentId: string) => {
  return useQuery({
    queryKey: ['courses-in-department', departmentId],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/instructors/department/${departmentId}/courses`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch courses');
      }
      return data.data;
    },
    enabled: !!departmentId,
  });
};

/**
 * Get all courses for assignment (from all departments)
 */
export const useGetAllCoursesForAssignment = () => {
  return useQuery({
    queryKey: ['all-courses-for-assignment'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/instructors/courses`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch courses');
      }
      return data.data;
    },
  });
};

/**
 * Assign a course to an instructor
 */
export const useAssignCourseToInstructor = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { instructorId: string; courseId: string }>({
    mutationFn: async ({ instructorId, courseId }) => {
      const { data } = await api.post<ApiResponse<any>>(
        `/api/admin/instructors/${instructorId}/assign-course`,
        { courseId }
      );
      if (!data.success) {
        throw new Error(data.message || 'Failed to assign course');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courses-in-department'] });
      queryClient.invalidateQueries({ queryKey: ['all-courses-for-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['instructor', variables.instructorId] });
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success(data.message || 'Course assigned successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to assign course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

/**
 * Remove course assignment from instructor
 */
export const useRemoveCourseFromInstructor = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { instructorId: string; courseId: string }>({
    mutationFn: async ({ instructorId, courseId }) => {
      const { data } = await api.delete<ApiResponse<any>>(
        `/api/admin/instructors/${instructorId}/remove-course/${courseId}`
      );
      if (!data.success) {
        throw new Error(data.message || 'Failed to remove course');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courses-in-department'] });
      queryClient.invalidateQueries({ queryKey: ['all-courses-for-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['instructor', variables.instructorId] });
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      toast.success(data.message || 'Course removed successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to remove course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== ROOMS HOOKS =====

export const useRooms = (params?: { page?: number; limit?: number; search?: string; building?: string; type?: string; isActive?: boolean }) => {
  return useQuery({
    queryKey: ['rooms', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/admin/rooms', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch rooms');
      }
      return data;
    },
  });
};

export const useRoom = (id: string) => {
  return useQuery({
    queryKey: ['room', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/rooms/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch room');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (roomData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/rooms', roomData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create room');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success(data.message || 'Room created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create room';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateRoom = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: roomData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/rooms/${id}`, roomData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update room');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['room', variables.id] });
      toast.success(data.message || 'Room updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update room';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteRoom = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/rooms/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete room');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      toast.success('Room deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete room';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// Bulk create rooms
export const useBulkCreateRooms = () => {
  const queryClient = useQueryClient();
  return useMutation<
    ApiResponse<{
      successful: Array<{
        index: number;
        number: string;
        success: boolean;
        room: any;
      }>;
      errors: Array<{
        index: number;
        number: string;
        error: string;
      }>;
      summary: {
        total: number;
        successful: number;
        failed: number;
      };
    }>,
    Error,
    {
      rooms: Array<{
        number: string;
        name?: string;
        building: string;
        floor?: number;
        capacity: number;
        type: string;
        hasProjector?: boolean;
        hasComputers?: boolean;
        hasWifi?: boolean;
        hasWhiteboard?: boolean;
        hasAC?: boolean;
        computerCount?: number;
        isActive?: boolean;
        notes?: string;
      }>;
    }
  >({
    mutationFn: async (request) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/rooms/bulk/create', request);

      if (!data.success) {
        throw new Error(data.message || 'Failed to process bulk room creation');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      const results = data.data?.summary || { successful: 0, failed: 0 };
      const created = (results as any).successful || 0;
      const failed = (results as any).failed || 0;

      let message = `Bulk room creation completed: ${created} created`;
      if (failed > 0) message += `, ${failed} failed`;

      toast.success(message, {
        position: toastStyles.success.position,
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
      });
    },
    onError: (error: unknown) => {
      console.error('Bulk create rooms error:', error);
      const axiosError = error as { response?: { data?: { message?: string; error?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to process bulk room creation';

      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== TIMESLOTS HOOKS =====

export const useTimeSlots = (params?: {
  page?: number;
  limit?: number;
  day?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) => {
  return useQuery({
    queryKey: ['timeslots', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/admin/timeslots', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch time slots');
      }
      return data;
    },
  });
};

export const useTimeSlot = (id: string) => {
  return useQuery({
    queryKey: ['timeslot', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/timeslots/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch time slot');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useCreateTimeSlot = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (timeSlotData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/timeslots', timeSlotData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create time slot');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timeslots'] });
      toast.success(data.message || 'Time slot created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create time slot';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateTimeSlot = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: timeSlotData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/timeslots/${id}`, timeSlotData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update time slot');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['timeslots'] });
      queryClient.invalidateQueries({ queryKey: ['timeslot', variables.id] });
      toast.success(data.message || 'Time slot updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update time slot';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useBulkCreateTimeSlots = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (timeSlots) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/timeslots/bulk/create', { timeSlots });
      if (!data.success) {
        throw new Error(data.message || 'Failed to bulk create time slots');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timeslots'] });
      toast.success(data.message || 'Time slots created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string; errors?: any[] } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to bulk create time slots';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteTimeSlot = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/timeslots/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete time slot');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeslots'] });
      toast.success('Time slot deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete time slot';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== USER MANAGEMENT HOOKS =====

export const useUsers = (params?: { page?: number; limit?: number; search?: string; role?: string; isActive?: boolean; facultyId?: string; departmentId?: string }) => {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.role) queryParams.append('role', params.role);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
      if (params?.facultyId) queryParams.append('facultyId', params.facultyId);
      if (params?.departmentId) queryParams.append('departmentId', params.departmentId);

      const { data } = await api.get<ApiResponse<any>>(`/api/admin/users?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch users');
      }
      return data;
    },
  });
};

export const useUser = (id: string) => {
  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/users/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch user');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: userData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/users/${id}`, userData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update user');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      toast.success(data.message || 'User updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update user';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/users/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete user');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deactivated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete user';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useToggleUserStatus = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/admin/users/${id}/toggle-status`, { isActive });
      if (!data.success) {
        throw new Error(data.message || 'Failed to toggle user status');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      toast.success(data.message || 'User status updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to toggle user status';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useAssignRole = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; role: string }>({
    mutationFn: async ({ id, role }) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/admin/users/${id}/roles`, { role });
      if (!data.success) {
        throw new Error(data.message || 'Failed to assign role');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      toast.success(data.message || 'Role assigned successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to assign role';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useRemoveRole = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; roleId: string }>({
    mutationFn: async ({ id, roleId }) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/users/${id}/roles/${roleId}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to remove role');
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      toast.success('Role removed successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to remove role';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useInviteHOD = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (hodData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/auth/invite-hod', hodData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to invite HOD');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success(data.message || 'HOD invited successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to invite HOD';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== FACULTY HOOKS =====

export const useFaculties = (params?: { page?: number; limit?: number; search?: string; isActive?: boolean }) => {
  return useQuery({
    queryKey: ['faculties', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

      const { data } = await api.get<ApiResponse<any>>(`/api/admin/faculties?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch faculties');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useFaculty = (id: string) => {
  return useQuery({
    queryKey: ['faculty', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/faculties/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch faculty');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

// ===== DASHBOARD HOOKS =====

export const useDashboardStats = () => {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/dashboard/stats');
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch dashboard statistics');
      }
      return data.data;
    },
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
  });
};

export const useDashboardStatsByRole = () => {
  return useQuery({
    queryKey: ['dashboard', 'stats', 'by-role'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/dashboard/stats/by-role');
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch dashboard statistics by role');
      }
      return data.data;
    },
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
  });
};

// ===== TIMETABLE HOOKS =====

export const useTimetables = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  semesterId?: string;
  status?: string;
  isActive?: boolean;
  facultyId?: string;
}) => {
  return useQuery({
    queryKey: ['timetables', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.departmentId) queryParams.append('departmentId', params.departmentId);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
      if (params?.facultyId) queryParams.append('facultyId', params.facultyId);

      const { data } = await api.get<ApiResponse<any>>(`/api/timetable?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch timetables');
      }
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useTimetable = (id: string, includeSessions: boolean = true) => {
  return useQuery({
    queryKey: ['timetable', id, includeSessions],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/${id}?includeSessions=${includeSessions}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch timetable');
      }
      return data.data;
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCreateTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (timetableData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/timetable', timetableData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to create timetable');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      toast.success(data.message || 'Timetable created successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to create timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data: any }>({
    mutationFn: async ({ id, data: timetableData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/timetable/${id}`, timetableData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update timetable');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      queryClient.invalidateQueries({ queryKey: ['timetable', variables.id] });
      toast.success(data.message || 'Timetable updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/timetable/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to delete timetable');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      toast.success('Timetable deleted successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to delete timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDuplicateTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; data?: { weekNumber?: number; name?: string; validFrom?: string; validTo?: string } }>({
    mutationFn: async ({ id, data: duplicateData }) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/timetable/${id}/duplicate`, duplicateData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to duplicate timetable');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      toast.success(data.message || 'Timetable duplicated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to duplicate timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};


export const useGenerateTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, any>({
    mutationFn: async (generateData) => {
      const { data } = await api.post<ApiResponse<any>>('/api/timetable/generate', generateData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to generate timetable');
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      toast.success(data.message || 'Timetable generation started successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to generate timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const usePublishTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/timetable/${id}/publish`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to publish timetable');
      }
      return data;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      queryClient.invalidateQueries({ queryKey: ['timetable', id] });
      toast.success(data.message || 'Timetable published successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to publish timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUnpublishTimetable = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, string>({
    mutationFn: async (id) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/timetable/${id}/unpublish`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to unpublish timetable');
      }
      return data;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['timetables'] });
      queryClient.invalidateQueries({ queryKey: ['timetable', id] });
      toast.success(data.message || 'Timetable unpublished successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to unpublish timetable';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useSchoolWideTimetable = (params?: { startDate?: string; endDate?: string; semesterId?: string; status?: string; timetableId?: string }) => {
  return useQuery({
    queryKey: ['timetable', 'school-wide', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);
      if (params?.status) queryParams.append('status', params.status);
      if (params?.timetableId) queryParams.append('timetableId', params.timetableId);

      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/school-wide?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch school-wide timetable');
      }
      return data.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useDepartmentTimetable = (deptId: string, params?: { startDate?: string; endDate?: string; semesterId?: string; status?: string }) => {
  return useQuery({
    queryKey: ['timetable', 'department', deptId, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);
      if (params?.status) queryParams.append('status', params.status);

      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/department/${deptId}?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch department timetable');
      }
      return data.data;
    },
    enabled: !!deptId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useInstructorTimetable = (instructorId: string, params?: { startDate?: string; endDate?: string; semesterId?: string }) => {
  return useQuery({
    queryKey: ['timetable', 'instructor', instructorId, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);

      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/instructor/${instructorId}?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch instructor timetable');
      }
      return data.data;
    },
    enabled: !!instructorId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useStudentTimetable = (studentId: string, params?: { startDate?: string; endDate?: string; semesterId?: string }) => {
  return useQuery({
    queryKey: ['timetable', 'student', studentId, params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);

      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/student/${studentId}?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch student timetable');
      }
      return data.data;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useTimetableConflicts = (timetableId: string) => {
  return useQuery({
    queryKey: ['timetable', timetableId, 'conflicts'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/timetable/${timetableId}/conflicts`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch timetable conflicts');
      }
      return data.data;
    },
    enabled: !!timetableId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// ===== STUDENT HOOKS =====

export const useStudents = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  isActive?: boolean;
  batch?: string;
  section?: string;
  facultyId?: string;
}) => {
  return useQuery({
    queryKey: ['students', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.search) queryParams.append('search', params.search);
      if (params?.departmentId) queryParams.append('departmentId', params.departmentId);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
      if (params?.batch) queryParams.append('batch', params.batch);
      if (params?.section) queryParams.append('section', params.section);
      if (params?.facultyId) queryParams.append('facultyId', params.facultyId);

      const { data } = await api.get<ApiResponse<any>>(`/api/admin/students?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch students');
      }
      return data;
    },
  });
};

export const useStudent = (id: string) => {
  return useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/students/${id}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch student');
      }
      return data.data;
    },
    enabled: !!id,
  });
};

/**
 * Assign student profile (create or update)
 */
export const useAssignStudentProfile = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { id: string; studentId?: string; departmentId: string; currentSemester: number; enrollmentYear: number; section?: string; batch?: string; isActive?: boolean }>({
    mutationFn: async ({ id, studentId, departmentId, currentSemester, enrollmentYear, section, batch, isActive }) => {
      const payload: any = { departmentId, currentSemester, enrollmentYear };
      if (studentId) payload.studentId = studentId;
      if (section) payload.section = section;
      if (batch) payload.batch = batch;
      if (isActive !== undefined) payload.isActive = isActive;

      const { data } = await api.post<ApiResponse<any>>(`/api/admin/students/${id}/assign-profile`, payload);
      if (!data.success) {
        throw new Error(data.message || 'Failed to assign student profile');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student', variables.id] });
      toast.success(data.message || 'Student profile assigned successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to assign student profile';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useStudentCourses = (studentId: string, params?: { semesterId?: string; isActive?: boolean }) => {
  return useQuery({
    queryKey: ['student', studentId, 'courses', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);
      if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());

      const { data } = await api.get<ApiResponse<any>>(`/api/admin/students/${studentId}/courses?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch student courses');
      }
      return data.data;
    },
    enabled: !!studentId,
  });
};

export const useEnrollStudentCourse = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { studentId: string; courseId: string; grade?: string }>({
    mutationFn: async ({ studentId, courseId, grade }) => {
      const { data } = await api.post<ApiResponse<any>>(`/api/admin/students/${studentId}/courses`, {
        courseId,
        grade,
      });
      if (!data.success) {
        throw new Error(data.message || 'Failed to enroll student in course');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId, 'courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId] });
      toast.success(data.message || 'Student enrolled in course successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to enroll student in course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateStudentCourseEnrollment = () => {
  const queryClient = useQueryClient();
  return useMutation<ApiResponse<any>, Error, { studentId: string; courseId: string; data: any }>({
    mutationFn: async ({ studentId, courseId, data: enrollmentData }) => {
      const { data } = await api.put<ApiResponse<any>>(`/api/admin/students/${studentId}/courses/${courseId}`, enrollmentData);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update student course enrollment');
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId, 'courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId] });
      toast.success(data.message || 'Student course enrollment updated successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to update student course enrollment';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUnenrollStudentCourse = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { studentId: string; courseId: string }>({
    mutationFn: async ({ studentId, courseId }) => {
      const { data } = await api.delete<ApiResponse<void>>(`/api/admin/students/${studentId}/courses/${courseId}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to unenroll student from course');
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId, 'courses'] });
      queryClient.invalidateQueries({ queryKey: ['student', variables.studentId] });
      toast.success('Student unenrolled from course successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to unenroll student from course';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useStudentAcademicReport = (studentId: string) => {
  return useQuery({
    queryKey: ['student', studentId, 'academic-report'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>(`/api/admin/students/${studentId}/academic-report`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch student academic report');
      }
      return data.data;
    },
    enabled: !!studentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// ===== REPORTS HOOKS =====

export const useReports = (params?: {
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  semesterId?: string;
}) => {
  return useQuery({
    queryKey: ['reports', params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('startDate', params.startDate);
      if (params?.endDate) queryParams.append('endDate', params.endDate);
      if (params?.departmentId) queryParams.append('departmentId', params.departmentId);
      if (params?.semesterId) queryParams.append('semesterId', params.semesterId);

      const { data } = await api.get<ApiResponse<any>>(`/api/reports?${queryParams.toString()}`);
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch reports');
      }
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useExportReports = () => {
  return useMutation<Blob, Error, { format?: string; type?: string; startDate?: string; endDate?: string; departmentId?: string; semesterId?: string }>({
    mutationFn: async (params) => {
      const queryParams = new URLSearchParams();
      if (params.format) queryParams.append('format', params.format);
      if (params.type) queryParams.append('type', params.type);
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      if (params.departmentId) queryParams.append('departmentId', params.departmentId);
      if (params.semesterId) queryParams.append('semesterId', params.semesterId);

      const response = await api.get(`/api/reports/export?${queryParams.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reports_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return blob;
    },
    onSuccess: () => {
      toast.success('Reports exported successfully!', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const errorMessage = axiosError.response?.data?.message || 'Failed to export reports';
      toast.error(errorMessage, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== FACULTIES HOOKS =====

export const useCreateFaculty = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (facultyData: any) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/faculties', facultyData);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Faculty created successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create faculty';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateFaculty = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: responseData } = await api.put<ApiResponse<any>>(`/api/admin/faculties/${id}`, data);
      return responseData;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Faculty updated successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update faculty';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteFaculty = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<ApiResponse<any>>(`/api/admin/faculties/${id}`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Faculty deleted successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['faculties'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete faculty';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

// ===== INTAKES HOOKS =====

export const useIntakes = (params?: { isActive?: boolean }) => {
  return useQuery({
    queryKey: ['intakes', params],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<any>>('/api/admin/intakes', { params });
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch intakes');
      }
      return data;
    },
  });
};

export const useCreateIntake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (intakeData: any) => {
      const { data } = await api.post<ApiResponse<any>>('/api/admin/intakes', intakeData);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Intake created successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to create intake';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useUpdateIntake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: responseData } = await api.put<ApiResponse<any>>(`/api/admin/intakes/${id}`, data);
      return responseData;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Intake updated successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to update intake';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};

export const useDeleteIntake = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<ApiResponse<any>>(`/api/admin/intakes/${id}`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Intake deleted successfully', {
        style: toastStyles.success.style,
        duration: toastStyles.success.duration,
        position: toastStyles.success.position
      });
      queryClient.invalidateQueries({ queryKey: ['intakes'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Failed to delete intake';
      toast.error(message, {
        style: toastStyles.error.style,
        duration: toastStyles.error.duration,
      });
    },
  });
};