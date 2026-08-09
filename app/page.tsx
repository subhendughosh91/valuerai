import { ProductionApp } from "../components/production-app";
import { ValuerApp } from "../components/valuer-app";

export default function Home() { return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? <ProductionApp /> : <ValuerApp />; }
