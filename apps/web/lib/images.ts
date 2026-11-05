function isCloudinaryImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" &&
      /^\/[^/]+\/image\/upload\/v\d+\//.test(url.pathname);
  } catch { return false; }
}

export function optimizedImage(value: string, width: number): string {
  if (!isCloudinaryImage(value)) return value;
  return value.replace("/image/upload/", `/image/upload/c_limit,w_${width},f_auto,q_auto/`);
}

export function responsiveImageSet(value: string): string | undefined {
  if (!isCloudinaryImage(value)) return undefined;
  return [320, 640, 960, 1440].map((width) => `${optimizedImage(value, width)} ${width}w`).join(", ");
}
