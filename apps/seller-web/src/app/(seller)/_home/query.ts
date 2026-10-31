/** What `useApi` returns, for blocks that receive a request from the page. */
export type Query<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };
