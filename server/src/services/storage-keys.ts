export const maxUploadBytes = 8 * 1024 * 1024;

export function isSafeUploadKey(key: string, prefix: string, userId?: string) {
  return key.startsWith(`${prefix}/${userId ? `${userId}/` : ""}`) && !key.split("/").some((part) => part === ".." || part === ".");
}
