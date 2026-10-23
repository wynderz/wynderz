import type { SVGProps } from "react";

const paths: Record<string, string> = {
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  calendar: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm-2 7h14v10H5V9Z",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm3 5v2h6V7H9Zm0 4v2h6v-2H9Z",
  cog: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.9 3-.1-1-2.1-.6a7 7 0 0 0-.7-1.6l1-2-1.4-1.4-2 1a7 7 0 0 0-1.6-.7L13 2.1h-2l-.6 2.1c-.6.2-1.1.4-1.6.7l-2-1-1.4 1.4 1 2c-.3.5-.5 1-.7 1.6L3.1 10v2l2.1.6c.2.6.4 1.1.7 1.6l-1 2 1.4 1.4 2-1c.5.3 1 .5 1.6.7l.6 2.1h2l.6-2.1c.6-.2 1.1-.4 1.6-.7l2 1 1.4-1.4-1-2c.3-.5.5-1 .7-1.6l2.1-.6v-1Z",
  box: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.6 8 12 11.7 5.4 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.4V9.7Zm8 10v-6.6l6-3.4v6.6l-6 3.4Z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0v1H2v-1Zm15-9a3 3 0 1 0 0-6v6Zm1 2.1A6 6 0 0 1 22 20v1h-4v-1c0-2.6-1-4.9-2.6-6.6.8-.2 1.7-.3 2.6-.3Z",
  fingerprint: "M12 3a8 8 0 0 0-8 8v2h2v-2a6 6 0 0 1 12 0v4h2v-4a8 8 0 0 0-8-8Zm0 4a4 4 0 0 0-4 4v4c0 2 1 4 2.5 5.3l1.3-1.5A5 5 0 0 1 10 15v-4a2 2 0 1 1 4 0v5h2v-5a4 4 0 0 0-4-4Zm-1 4v4a7 7 0 0 0 3.6 6.1l1-1.7A5 5 0 0 1 13 15v-4h-2Z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l3.5 2.1-1 1.7L11 13.6V7h2Z",
  wallet: "M3 6a2 2 0 0 1 2-2h13v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Zm2 1v11h14V9H5V7Zm11 5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
  truck: "M2 5h12v9h2V8h3l3 4v5h-2a3 3 0 0 1-6 0H9a3 3 0 0 1-6 0H2V5Zm4 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm11 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
  file: "M6 2h8l6 6v14H6V2Zm7 1.5V9h5.5L13 3.5ZM8 12v2h8v-2H8Zm0 4v2h8v-2H8Z",
  chart: "M4 3h2v16h15v2H4V3Zm4 10h3v4H8v-4Zm5-5h3v9h-3V8Zm5-3h3v12h-3V5Z",
  shield: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 13-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4L11 15Z",
  history: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.1 5l-1.4 1.4A9 9 0 1 0 13 3Zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8H12Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  edit: "M4 17.2V20h2.8l8.3-8.3-2.8-2.8L4 17.2ZM17.7 9.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.1 1.1 2.8 2.8 1.1-1.1Z",
  archive: "M3 4h18v4H3V4Zm1 5h16v11H4V9Zm5 3v2h6v-2H9Z",
  restore: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 7 7v2a9 9 0 0 0 0-18Z",
  trash: "M9 3h6l1 1h4v2H4V4h4l1-1Zm-3 5h12l-1 13H7L6 8Z",
  download: "M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 18h16v2H4v-2Z",
  upload: "M11 16h2V6.8l3.3 3.3 1.4-1.4L12 3 6.3 8.7l1.4 1.4L11 6.8V16Zm-7 2h16v2H4v-2Z",
  print: "M7 3h10v4H7V3ZM5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2Zm4 7v3h6v-3H9Z",
  menu: "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z",
  close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z",
  logout: "M10 3H4v18h6v-2H6V5h4V3Zm5.6 4.6L14.2 9l2 2H9v2h7.2l-2 2 1.4 1.4L20 12l-4.4-4.4Z",
  eye: "M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  money: "M2 6h20v12H2V6Zm2 2v8h16V8H4Zm8 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-1-6h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2Z",
  moon: "M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8 8.5 8.5 0 1 0 20.2 14.2Z",
};

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="16" height="16" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
