export function isUnsupportedCloudRuntime() {
  return (
    (process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV)) &&
    process.env.ALLOW_UNSUPPORTED_VERCEL_RUNTIME !== "true"
  );
}
