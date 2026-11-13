import { jsonLdString } from "@/lib/seo";

/**
 * Structured data for search engines (schema.org JSON-LD). Rendered on the
 * server into the page's HTML; nothing shows on screen. jsonLdString escapes
 * "<" so the data can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
