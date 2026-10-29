"use client";
import { HumanMessages } from "@/features/human/components/human-messages";
import { AdviserRecommendations } from "@/features/human/components/adviser-recommendations";
import { AdviserNav } from "@/features/human/components/adviser-nav";
export default function AdviserPage() { return <><AdviserNav active="messages" /><HumanMessages adviserMode /><AdviserRecommendations /></>; }
