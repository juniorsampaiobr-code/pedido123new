# AI Development Rules

This document outlines the technical stack and coding conventions for this project. Following these rules ensures consistency, maintainability, and scalability.

## Tech Stack

This project is built with a modern, component-based architecture. Key technologies include:

-   **Framework**: React, built with Vite for a fast development experience.
-   **Language**: TypeScript for type safety and improved developer experience.
-   **UI Components**: shadcn/ui, providing a set of accessible and reusable components.
-   **Styling**: Tailwind CSS for a utility-first styling approach.
-   **Routing**: React Router (`react-router-dom`) for client-side navigation.
-   **Backend & Database**: Supabase for authentication, database, and other backend services.
-   **Data Fetching**: TanStack Query (`@tanstack/react-query`) for managing server state, caching, and data synchronization.
-   **Forms**: React Hook Form (`react-hook-form`) combined with Zod for robust form handling and validation.
-   **Icons**: `lucide-react` for a comprehensive and consistent set of icons.
-   **Notifications**: `sonner` for simple and elegant toast notifications.

## Library Usage Rules

To maintain code quality and consistency, please adhere to the following library usage guidelines:

-   **UI Components**:
    -   Always prioritize using components from the `@/components/ui` directory (shadasecn/ui).
    -   For custom, application-specific components, create new files in `@/components`. These can compose existing shadcn/ui components.
    -   **Do not** modify the files inside `@/components/ui` directly.

-   **Styling**:
    -   Use Tailwind CSS utility classes for all styling. Avoid writing custom CSS in `.css` files unless absolutely necessary for global styles or complex animations.
    -   Use the `cn` utility function from `@/lib/utils.ts` to conditionally apply classes.

-   **Routing**:
    -   All page-level components must be placed in the `src/pages` directory.
    -   Define all routes within `src/App.tsx` using components from `react-router-dom`.

-   **State Management & Data Fetching**:
    -   Use TanStack Query (`useQuery`, `useMutation`) for all interactions with the Supabase API or any other external data source.
    -   For local, component-level state, use React hooks like `useState` and `useReducer`.

-   **Backend Interaction (Supabase)**:
    -   Always import and use the pre-configured Supabase client from `@/integrations/supabase/client.ts` for all database queries, authentication, and storage operations.

-   **Forms**:
    -   Use `react-hook-form` for managing form state, validation, and submissions.
    -   Define validation schemas using `zod` and connect them to your forms using `@hookform/resolvers/zod`.

-   **Icons**:
    -   Use icons exclusively from the `lucide-react` library to maintain visual consistency.

-   **Notifications**:
    -   Use the `toast()` function from `sonner` to display feedback to the user (e.g., success messages, errors).