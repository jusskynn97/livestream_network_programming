
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";

async function checkNotifications() {
    const client = createBrowserClient();
    try {
        const collections = await client.collections.getList();
        const notificationCollection = collections.items.find(c => c.name === 'notifications');
        console.log("Notification Collection:", JSON.stringify(notificationCollection, null, 2));
    } catch (e) {
        console.error("Error fetching collections:", e);
    }
}

checkNotifications();
