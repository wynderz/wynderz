import Image from "next/image";

export type YoutubeVideo = {
  title: string;
  description: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  thumbnail: string;
  isActive?: boolean;
  displayOrder?: number;
};

type YoutubeVideoCardProps = {
  video: YoutubeVideo;
};

export function YouTubeVideoCard({ video }: YoutubeVideoCardProps) {
  return (
    <a
      href={video.youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="card-highlight group relative block overflow-hidden rounded-lg border border-border bg-card"
      aria-label={`Watch ${video.title} on YouTube`}
    >
      <div className="relative aspect-video bg-surface-low">
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
        />
        <span
          className="absolute inset-0 flex items-center justify-center bg-brand/25 transition group-hover:bg-brand/35"
          aria-hidden
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff0000] text-white shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-current" aria-hidden>
              <path d="M8 5.14v13.72L19 12 8 5.14z" />
            </svg>
          </span>
        </span>
      </div>
      <div className="p-5">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-navy">
          {video.title}
        </h3>
        {video.description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">{video.description}</p>
        ) : null}
      </div>
    </a>
  );
}
