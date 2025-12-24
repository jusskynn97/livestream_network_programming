import ClientPage from "./page.client";
import type { Metadata } from "next";

export default function Wallet() {
    return (
        <ClientPage />
    )
}

export const metadata: Metadata = {
    title: "Wallet"
}