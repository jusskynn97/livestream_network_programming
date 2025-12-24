import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient"
import { useEffect, useState } from "react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import Link from "next/link";

type NotificationListProps = {
    trigger: React.ReactNode;
    notifications: any[];
}

export function NotificationsListModal({ trigger, notifications }: NotificationListProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                {trigger}
            </PopoverTrigger>
            <PopoverContent sideOffset={20} collisionPadding={60} className="shadow-lg w-80 max-h-96 overflow-y-auto" >
                <div className="w-full rounded-lg divide-y divide-dashed hover:divide-solid">
                    {notifications.length === 0 && (
                        <div className="flex items-center justify-center py-2">
                            <p className="text-sm font-semibold">No new notifications</p>
                        </div>
                    )}
                    {notifications.map((notification: any) => (
                        <Link href={notification.related_id || '#'} key={notification.id} className="block hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between py-3 px-2">
                                <div className="flex items-center w-full">
                                    <div className={`shrink-0 w-3 h-3 rounded-full ${notification.is_read ? 'bg-gray-300' : 'bg-blue-500'}`} />
                                    <div className="ml-3 flex flex-col">
                                        <p className="text-sm font-medium leading-snug">{notification.message}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {notification.created ? new Date(notification.created).toLocaleString() : ''}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </PopoverContent>
        </Popover>

    )
}
