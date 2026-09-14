import { Trip, TripSection } from "../types/trip";
import { renderMarkdown } from "./markdownRenderer";

// Glob import all trip.json files recursively across all folders in /src/trips/
const jsonModules = (import.meta as any).glob(['/src/trips/**/trip.json', '/src/trips/**/trip.JSON'], { eager: true });

// Glob import all markdown files recursively across all folders in /src/trips/
const mdModules = (import.meta as any).glob('/src/trips/**/*.md', { query: '?raw', eager: true, import: 'default' });

export function loadLocalFolderTrips(): Trip[] {
  const loadedTrips: Trip[] = [];

  for (const path in jsonModules) {
    const rawData = (jsonModules[path] as any).default || jsonModules[path];
    if (!rawData || !rawData.slug) continue;

    // Extract directory path of current trip.json (e.g. /src/trips/thailand-feb-2027)
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    const processedSections: TripSection[] = [];

    // Case A: Sections explicitly declared in trip.json
    if (rawData.sections && Array.isArray(rawData.sections) && rawData.sections.length > 0) {
      rawData.sections.forEach((sec: any) => {
        const fileTarget = sec.file || `${sec.slug}.md`;
        const mdPath = `${dirPath}/${fileTarget}`;
        const rawMd = (mdModules[mdPath] as string) || "";
        
        processedSections.push({
          slug: sec.slug,
          title: sec.title,
          icon: sec.icon || "📄",
          content: rawMd ? renderMarkdown(rawMd) : (sec.content || "")
        });
      });
    } else {
      // Case B: Auto-scrub all .md files in this trip directory
      for (const mdPath in mdModules) {
        if (mdPath.startsWith(dirPath + '/')) {
          const rawMd = (mdModules[mdPath] as string) || "";
          const filename = mdPath.substring(mdPath.lastIndexOf('/') + 1);
          const fileSlug = filename.replace(/\.md$/i, '');

          // Extract title from first # header or format filename
          const titleMatch = rawMd.match(/^#\s+(.*)$/m);
          const extractedTitle = titleMatch ? titleMatch[1].trim() : fileSlug.replace(/[-_]/g, ' ').toUpperCase();

          processedSections.push({
            slug: fileSlug,
            title: extractedTitle,
            icon: "📄",
            content: renderMarkdown(rawMd)
          });
        }
      }
    }

    const trip: Trip = {
      id: rawData.slug,
      slug: rawData.slug,
      title: rawData.title,
      subtitle: rawData.subtitle,
      destination: rawData.destination || "Destination TBD",
      dates: typeof rawData.dates === "string" ? rawData.dates : `${rawData.dates?.start || ""} through ${rawData.dates?.end || ""}`,
      status: rawData.status || "upcoming",
      coverEmoji: rawData.coverEmoji || "🏝️",
      coverGradient: rawData.coverGradient || "linear-gradient(135deg, #0284c7, #3b82f6)",
      summary: rawData.summary || "",
      stats: rawData.stats,
      sections: processedSections,
      schedule: rawData.schedule || [],
      reservations: rawData.reservations || [],
      packingList: rawData.packingList || [],
      notes: rawData.notes || []
    };

    loadedTrips.push(trip);
  }

  return loadedTrips;
}
