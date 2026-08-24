export function extractYoutubeVideoId(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return parsed.pathname.replace(/^\//, "").split("/")[0] || "";
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (parsed.searchParams.get("v")) return parsed.searchParams.get("v") || "";
      const embed = parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);
      if (embed?.[1]) return embed[1];
    }
  } catch {
    return "";
  }
  return "";
}

export function normalizeYoutubeUrl(url: string) {
  const id = extractYoutubeVideoId(url);
  if (!id || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) {
    throw new Error("Enter a valid YouTube URL such as https://www.youtube.com/watch?v=VIDEO_ID.");
  }
  return {
    youtubeVideoId: id,
    youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}
