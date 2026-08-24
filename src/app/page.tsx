import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { TrustStats } from "@/components/TrustStats";
import { HeroCarousel } from "@/components/HeroCarousel";
import { AboutSection } from "@/components/AboutSection";
import { ProductGrid } from "@/components/ProductGrid";
import { FeaturedProducts } from "@/components/FeaturedProducts";
import { Applications } from "@/components/Applications";
import { WhyWynderz } from "@/components/WhyWynderz";
import { ImageGallery } from "@/components/ImageGallery";
import { VideoGallery } from "@/components/VideoGallery";
import { EnquiryCTA } from "@/components/EnquiryCTA";
import { Contact } from "@/components/Contact";
import { Footer } from "@/components/Footer";
import { carouselProducts } from "@/data/site";

export default function Home() {
  return (
    <>
      <a
        href="#carousel"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:m-0 focus:inline-flex focus:h-auto focus:w-auto focus:overflow-visible focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to product carousel
      </a>
      <Header />
      <main>
        <Hero />
        <HeroCarousel products={carouselProducts} />
        <TrustStats />
        <AboutSection />
        <ProductGrid />
        <FeaturedProducts />
        <Applications />
        <WhyWynderz />
        <ImageGallery />
        <VideoGallery />
        <EnquiryCTA />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
