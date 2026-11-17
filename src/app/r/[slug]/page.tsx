import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SpinWheel from "@/components/SpinWheel";
import { getAdmin } from "@/lib/supabase-admin";
import type { PublicRestaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

type Loaded =
  | { state: "ok"; restaurant: PublicRestaurant }
  | { state: "paused"; name: string }
  | { state: "missing" };

async function loadRestaurant(slug: string): Promise<Loaded> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { state: "missing" };

  const admin = getAdmin();
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, slug, is_active, service_until")
    .eq("slug", slug)
    .maybeSingle();
  if (!restaurant) return { state: "missing" };

  // স্থগিত বা সাবস্ক্রিপশনের মেয়াদ শেষ — কাস্টমারকে ভদ্র বার্তা দেখাই
  if (!restaurant.is_active || new Date(restaurant.service_until).getTime() <= Date.now()) {
    return { state: "paused", name: restaurant.name };
  }

  const { data: rewards } = await admin
    .from("rewards")
    .select("position, label, discount_amount, color")
    .eq("restaurant_id", restaurant.id)
    .order("position", { ascending: true });
  if (!rewards || rewards.length !== 8) return { state: "missing" };

  return {
    state: "ok",
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      // weight ইচ্ছাকরেই বাদ — কাস্টমারের সম্ভাবনা জানার দরকার নেই
      rewards: rewards.map((r) => ({
        position: r.position,
        label: r.label,
        discountAmount: r.discount_amount,
        color: r.color,
      })),
    },
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadRestaurant(slug).catch(() => ({ state: "missing" }) as Loaded);
  const name = loaded.state === "ok" ? loaded.restaurant.name : loaded.state === "paused" ? loaded.name : null;
  return {
    title: name ? `${name} — স্পিন করে জিতুন` : "স্পিন করে জিতুন",
    robots: { index: false },
  };
}

export default async function RestaurantSpinPage({ params }: { params: Params }) {
  const { slug } = await params;
  const loaded = await loadRestaurant(slug);

  if (loaded.state === "missing") notFound();

  if (loaded.state === "paused") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl" aria-hidden>
          🎡
        </p>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{loaded.name}</h1>
        <p className="mt-3 text-slate-600">স্পিন সেবাটি এখন সাময়িকভাবে বন্ধ আছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন।</p>
      </main>
    );
  }

  return (
    <SpinWheel slug={loaded.restaurant.slug} restaurantName={loaded.restaurant.name} rewards={loaded.restaurant.rewards} />
  );
}
