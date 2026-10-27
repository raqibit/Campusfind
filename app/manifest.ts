import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CampusFind",
    short_name: "CampusFind",
    description: "Report, match and safely recover lost items on campus.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#10172a",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
