// src/redux/api/authApiSlice.ts
import { apiSlice } from "./apiSlice";

/**
 * Per section: an option number, or the account's own text. Missing means
 * the option the account's ID selects (see `defaults`).
 */
export type CopyrightWording = Record<string, number | string>;

// Mirrors backend CopyrightSettings; blank fields use the defaults
export interface CopyrightSettings {
  holder?: string;
  publisher?: string;
  contactEmail?: string;
  website?: string;
  customNotice?: string;
  wording?: CopyrightWording;
}

export interface CopyrightSection {
  key: string;
  label: string;
  description: string;
  options: string[]; // May contain {subject}, {year}, {holder}, {publisher}, {contact}
}

export interface CopyrightResponse {
  settings: CopyrightSettings;
  sections: CopyrightSection[];
  defaults: Record<string, number>;
  preview: string;
}

// Mirrors backend TocSettings: an option number, or (heading and entry only)
// the account's own text. Missing means the account's default option.
export interface TableOfContentsSettings {
  heading?: number | string;
  entry?: number | string; // Own text must contain {title}
  detail?: number;
}

export type TableOfContentsKey = keyof TableOfContentsSettings;

export interface TableOfContentsSection {
  key: TableOfContentsKey;
  label: string;
  description: string;
  custom: boolean; // Whether the account can write its own
  options: string[]; // Entry options may contain {n}, {word}, {roman}, {title}
}

export interface TableOfContentsResponse {
  settings: TableOfContentsSettings;
  sections: TableOfContentsSection[];
  defaults: Record<TableOfContentsKey, number>;
  preview: string;
}

// Mirrors backend FontSettings: a font id per role. Missing means the
// account's default (see `defaults`).
export type FontRole = "heading" | "body";
export type FontSettings = Partial<Record<FontRole, string>>;

export interface FontOption {
  id: string;
  family: string; // Google Fonts family name, used for the live preview
  category: "serif" | "sans";
}

export interface FontSection {
  key: FontRole;
  label: string;
  description: string;
  options: FontOption[];
}

export interface FontsResponse {
  settings: FontSettings;
  sections: FontSection[];
  defaults: Record<FontRole, string>;
}

export const authApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
    }),
    register: builder.mutation({
      query: (userData) => ({
        url: "/auth/register",
        method: "POST",
        body: userData,
      }),
    }),
    logout: builder.mutation({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
    }),
    profile: builder.query({
      query: () => "/auth/profile",
    }),
    getCopyright: builder.query<CopyrightResponse, void>({
      query: () => "/auth/copyright",
      providesTags: [{ type: "User", id: "COPYRIGHT" }],
    }),
    updateCopyright: builder.mutation<CopyrightResponse, CopyrightSettings>({
      query: (body) => ({
        url: "/auth/copyright",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "User", id: "COPYRIGHT" }],
    }),
    previewCopyright: builder.mutation<{ preview: string }, CopyrightSettings>({
      query: (body) => ({
        url: "/auth/copyright/preview",
        method: "POST",
        body,
      }),
    }),
    getTableOfContents: builder.query<TableOfContentsResponse, void>({
      query: () => "/auth/table-of-contents",
      providesTags: [{ type: "User", id: "TABLE_OF_CONTENTS" }],
    }),
    updateTableOfContents: builder.mutation<
      TableOfContentsResponse,
      TableOfContentsSettings
    >({
      query: (body) => ({
        url: "/auth/table-of-contents",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "User", id: "TABLE_OF_CONTENTS" }],
    }),
    previewTableOfContents: builder.mutation<
      { preview: string },
      TableOfContentsSettings
    >({
      query: (body) => ({
        url: "/auth/table-of-contents/preview",
        method: "POST",
        body,
      }),
    }),
    getFonts: builder.query<FontsResponse, void>({
      query: () => "/auth/fonts",
      providesTags: [{ type: "User", id: "FONTS" }],
    }),
    updateFonts: builder.mutation<FontsResponse, FontSettings>({
      query: (body) => ({
        url: "/auth/fonts",
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "User", id: "FONTS" }],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useProfileQuery,
  useGetCopyrightQuery,
  useUpdateCopyrightMutation,
  usePreviewCopyrightMutation,
  useGetTableOfContentsQuery,
  useUpdateTableOfContentsMutation,
  usePreviewTableOfContentsMutation,
  useGetFontsQuery,
  useUpdateFontsMutation,
} = authApiSlice;
