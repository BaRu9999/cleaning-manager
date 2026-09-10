export function cn(...classes: unknown[]): string {
  return classes.filter((c) => typeof c === "string" && c.length > 0).join(" ");
}
