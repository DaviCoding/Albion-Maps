import ejs from "ejs";
import path from "path";

const VIEWS = path.resolve(import.meta.dirname, "../../views");

export async function render(template: string, data: Record<string, unknown> = {}): Promise<string> {
  return ejs.renderFile(path.join(VIEWS, template), data);
}