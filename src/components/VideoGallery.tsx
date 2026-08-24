import { readFile } from "fs/promises";
import path from "path";
import { YouTubeVideoCard } from "@/components/YouTubeVideoCard";

type VideoItem = {
  title: string;
  description: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnail: string;
  isActive?: boolean;
  displayOrder?: number;
};

type VideosContent = {
  kicker: string;
  heading: string;
  description: string;
  items: VideoItem[];
};

async function loadVideosContent(): Promise<VideosContent> {
  const raw = await readFile(path.join(process.cwd(), "content/videos.json"), "utf8");
  return JSON.parse(raw) as VideosContent;
}

export async function VideoGallery() {
  const videosContent = await loadVideosContent();
  const videos = [...videosContent.items]
    .filter((video) => video.isActive !== false && video.youtubeUrl && video.thumbnail)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  if (videos.length === 0) return null;

  return (
    <section id="videos" className="section-pad section-atmosphere" aria-labelledby="videos-heading">
      <div className="container-page">
        <div className="mb-10 max-w-2xl">
          <p className="section-kicker">{videosContent.kicker}</p>
          <h2 id="videos-heading" className="display-title mt-3 text-[clamp(1.9rem,4vw,3rem)]">
            {videosContent.heading}
          </h2>
          <div className="accent-rule mt-5" aria-hidden />
          <p className="mt-4 text-muted">{videosContent.description}</p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2">
          {videos.map((video) => (
            <li key={video.youtubeVideoId || video.title}>
              <YouTubeVideoCard video={video} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
