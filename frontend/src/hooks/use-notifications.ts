import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function useNotifications(isUserAuthenticated: boolean) {
    const [notifications, setNotifications] = useState<any[]>([]);
    const client = createBrowserClient();
    const router = useRouter();

    useEffect(() => {
        if (isUserAuthenticated && client.authStore.model) {
            // Fetch initial notifications
            const fetchNotifications = async () => {
                try {
                    const res = await client.collection('notifications').getList(1, 50, {
                        filter: `user="${client.authStore.model!.id}" && is_read=false`,
                        sort: '-created',
                    });
                    console.log("Fetched notifications:", res.items);
                    setNotifications(res.items);
                } catch (error) {
                    console.error("Failed to fetch notifications", error);
                    toast.error("Failed to fetch notifications");
                }
            };
            fetchNotifications();

            // Subscribe to notifications
            console.log("Subscribing to notifications...");
            client.collection('notifications').subscribe('*', (e) => {
                console.log("Notification event:", e);
                if (e.record.user === client.authStore.model?.id) {
                    if (e.action === 'create') {
                        toast(e.record.message, {
                            action: {
                                label: 'View',
                                onClick: () => router.push(e.record.related_id || '#')
                            }
                        });
                        setNotifications((prev) => [e.record, ...prev]);
                    } else if (e.action === 'update') {
                         if (e.record.is_read) {
                             setNotifications((prev) => prev.filter(n => n.id !== e.record.id));
                         } else {
                             setNotifications((prev) => prev.map(n => n.id === e.record.id ? e.record : n));
                         }
                    } else if (e.action === 'delete') {
                        setNotifications((prev) => prev.filter(n => n.id !== e.record.id));
                    }
                }
            }).catch(err => {
                console.error("Subscription failed:", err);
                toast.error("Realtime connection failed");
            });

            return () => {
                client.collection('notifications').unsubscribe('*');
            };
        }
    }, [isUserAuthenticated]);

    return { notifications, setNotifications };
}
