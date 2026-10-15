/** Shared HTTP boundary for web and future Capacitor clients. Never contains DB bindings. */
import type { DiaryResponse } from "../domain/model";
export async function diaryRequest<T = DiaryResponse>(
  path = "",
  body?: unknown,
  apiBase = "",
): Promise<T> {
  const response = await fetch(
    `${apiBase}/api/diary${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(
      data.error ?? "자료를 처리하지 못했습니다. 다시 시도하세요.",
    );
  return data as T;
}
