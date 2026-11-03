// src/redux/api/booksApiSlice.ts
import { apiSlice } from "./apiSlice";

export interface BookStatus {
  projectId: string;
  title: string;
  author: string;
  status: string;
  numberOfChapters: number;
  progress: number;
  isComplete: boolean;
  hasFailed: boolean;
  stats: {
    chapters: number;
    images: number;
    documents: string;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
  createdAt: string;
  estimatedCompletion: string;
}

export interface DocumentInfo {
  id: string;
  filename: string;
  type: string;
  language: string;
  size: string;
  url: string; // Cloudinary URL
  cloudinaryPublicId?: string;
  createdAt: string;
}

export interface DownloadLinks {
  projectId: string;
  title: string;
  totalDocuments: number;
  documents: DocumentInfo[];
}

export interface PreviewSection {
  id: string;
  kind: "copyright" | "about" | "chapter";
  label?: string;
  title: string;
  html: string; // Escaped on the server, same markup as the EPUB
}

export interface BookPreview {
  projectId: string;
  status: string;
  title: string;
  subtitle: string;
  author: string;
  sections: PreviewSection[];
}

export const booksApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    generateBook: builder.mutation<{ projectId: string }, FormData>({
      query: (formData) => ({
        url: "/books/generate",
        method: "POST",
        body: formData,
      }),
      invalidatesTags: [{ type: "Project", id: "LIST" }],
    }),

    getBookStatus: builder.query<BookStatus, string>({
      query: (projectId: string) => `/books/status/${projectId}`,
      // 🔥 CRITICAL FIX: No caching for status - always get fresh data
      keepUnusedDataFor: 0,
      // Force refetch every time
      // refetchOnMountOrArgChange: true,
      providesTags: (_result, _error, projectId) => [
        { type: "Project", id: projectId },
      ],
    }),

    getBookPreview: builder.query<BookPreview, string>({
      query: (projectId: string) => `/books/preview/${projectId}`,
      keepUnusedDataFor: 300,
      providesTags: (_result, _error, projectId) => [
        { type: "Project", id: projectId },
      ],
    }),

    getDownloadLinks: builder.query<DownloadLinks, string>({
      query: (projectId: string) => `/books/download/${projectId}`,
      // Cache download links for 60 seconds
      keepUnusedDataFor: 60,
      providesTags: (_result, _error, projectId) => [
        { type: "Project", id: projectId },
      ],
    }),
  }),
});

export const {
  useGenerateBookMutation,
  useGetBookStatusQuery,
  useGetBookPreviewQuery,
  useGetDownloadLinksQuery,
} = booksApiSlice;