"use client"

import CreatorLayout from "@/components/custom/creator-layout";
import FLVPlayer from "@/components/custom/flv-player";
import FollowerGraph from "@/components/custom/follower-graph";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";
import { Activity, Gift, Loader2, MessageSquareMore, Radio, SendHorizontal, Smile, MoreVertical, Trash, Ban, VolumeX, Shield, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StreamSettings, StreamCommand } from "@/lib/interfaces";
import { useEffect, useRef, useState } from "react";

import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useLocalStorage } from "@uidotdev/usehooks";
import dynamic from "next/dynamic";

const ResponsiveGridLayout = WidthProvider(Responsive);

function Dashboard() {
    const client = createBrowserClient();
    const [stream, setStream] = useState<any>(null);
    const [streamChat, setStreamChat] = useState<any>([]);
    const [isFetching, setIsFetching] = useState<boolean>(true);
    const [matchingCommands, setMatchingCommands] = useState<StreamCommand[]>([]);
    const commands = stream?.settings?.commands ?? [];
    const stream_settings = stream?.settings as StreamSettings;
    const inputRef = useRef<HTMLInputElement>(null);

    const [bannedUsersList, setBannedUsersList] = useState<any[]>([]);
    const [mutedUsersList, setMutedUsersList] = useState<any[]>([]);
    const [viewersList, setViewersList] = useState<any[]>([]);
    const [isModerationOpen, setIsModerationOpen] = useState(false);

    const [layout_settings, setLayoutSettings] = useLocalStorage("layout_setting", {
        stream_enabled: true,
        chat_enabled: true,
        quick_actions_enabled: true,
        session_info_enabled: true,
        activity_enabled: true,
        layout: [
            { i: 'session_info', x: 0, y: 0, w: 12, h: 4 },
            { i: 'stream', x: 0, y: 4, w: 9, h: 17 },
            { i: 'chat', x: 9, y: 4, w: 3, h: 17 },
            { i: 'quick_actions', x: 0, y: 5, w: 12, h: 4 },
            { i: 'activity', x: 0, y: 5, w: 6, h: 4 }
        ]
    });

    const getProperties = (layout: any, id: string) => {
        if (!layout) return null;
        const item = layout.find((l: any) => l.i === id);
        return item;
    }

    useEffect(() => {
        const user_id = client.authStore.model?.id;

        if (!user_id) return;
        const fetch = async () => {
            try {
                const stream = await client.collection("streams").getFirstListItem(`user="${user_id}"`);
                setStream(stream as any);
            } catch (error) {
                setStream({
                    exists: false
                });
            }
        }

        fetch();
    }, []);

    useEffect(() => {
        const stream_id = stream?.id;
        if (stream_id === null || stream_id === undefined || !stream_id) return;

        const fetchStreamChat = async () => {
            const streamChat = await client.collection('stream_messages').getList(1, 50, { sort: '-created', filter: `stream="${stream_id}"`, expand: 'user' })
            setStreamChat(streamChat.items.reverse());

            setIsFetching(false);
        }

        client.collection('stream_messages').subscribe(`*`, async (e) => {
            const record = e.record;
            const action = e.action;

            if (action === 'create' && record.stream === stream_id) {
                const user = await client.collection('users').getOne(record.user);
                record.expand = { user };
                setStreamChat((prev: any) => [...prev, record]);
            }

            if (action === 'delete') {
                setStreamChat((prev: any[]) => prev.filter((item) => item.id !== record.id));

            }
        });

        fetchStreamChat();

        return () => {
            client.collection('stream_messages').unsubscribe(`*`);
        }
    }, [stream?.id]);

    useEffect(() => {
        const fetchViewers = async () => {
            if (!isModerationOpen || !stream) return;
            try {
                // Fetch active viewers who pinged in the last 2 minutes
                const activeThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ');

                const metrics = await client.collection('user_metrics').getList(1, 500, {
                    filter: `stream="${stream.id}" && interaction_type="view" && created >= "${activeThreshold}"`,
                    sort: '-created',
                    expand: 'user'
                });
                
                const uniqueUsers = new Map();
                metrics.items.forEach((metric: any) => {
                    if (metric.expand?.user && metric.expand.user.id !== client.authStore.model?.id) {
                        uniqueUsers.set(metric.expand.user.id, metric.expand.user);
                    }
                });
                setViewersList(Array.from(uniqueUsers.values()));
            } catch (e) {
                console.error("Error fetching viewers", e);
            }
        }

        const fetchModeratedUsers = async () => {
            if (!isModerationOpen || !stream) return;

            const bannedIds = stream.settings?.banned_users || [];
            const mutedIds = stream.settings?.muted_users || [];

            if (bannedIds.length > 0) {
                const filter = bannedIds.map((id: string) => `id="${id}"`).join('||');
                try {
                    const users = await client.collection('users').getList(1, 50, { filter });
                    setBannedUsersList(users.items);
                } catch (e) {
                    console.error("Error fetching banned users", e);
                }
            } else {
                setBannedUsersList([]);
            }

            if (mutedIds.length > 0) {
                const filter = mutedIds.map((id: string) => `id="${id}"`).join('||');
                try {
                    const users = await client.collection('users').getList(1, 50, { filter });
                    setMutedUsersList(users.items);
                } catch (e) {
                    console.error("Error fetching muted users", e);
                }
            } else {
                setMutedUsersList([]);
            }
        }

        if (isModerationOpen && stream) {
            fetchModeratedUsers();
            fetchViewers();

            const interval = setInterval(() => {
                fetchViewers();
            }, 10000); // Poll every 10 seconds

            return () => clearInterval(interval);
        }
    }, [isModerationOpen, stream?.settings, stream?.id]);

    const updateSettings = async (newSettings: Partial<StreamSettings>) => {
        if (!stream) return;
        const currentSettings = stream.settings || {};
        const updatedSettings = { ...currentSettings, ...newSettings };
        
        setStream((prev: any) => ({ ...prev, settings: updatedSettings }));
        
        try {
            await client.collection('streams').update(stream.id, { settings: updatedSettings });
        } catch (error) {
            console.error("Failed to update settings", error);
        }
    }

    const deleteMessage = async (messageId: string) => {
        try {
            await client.collection('stream_messages').delete(messageId);
        } catch (error) {
            console.error("Failed to delete message", error);
        }
    }

    const muteUser = async (userId: string) => {
        if (!stream) return;
        const currentSettings = stream.settings || {};
        const mutedUsers = currentSettings.muted_users || [];
        if (!mutedUsers.includes(userId)) {
            const newSettings = { ...currentSettings, muted_users: [...mutedUsers, userId] };
            try {
                await client.collection('streams').update(stream.id, { settings: newSettings });
                setStream((prev: any) => ({ ...prev, settings: newSettings }));
            } catch (error) {
                console.error("Failed to mute user", error);
            }
        }
    }

    const banUser = async (userId: string) => {
        if (!stream) return;
        const currentSettings = stream.settings || {};
        const bannedUsers = currentSettings.banned_users || [];
        if (!bannedUsers.includes(userId)) {
            const newSettings = { ...currentSettings, banned_users: [...bannedUsers, userId] };
            try {
                await client.collection('streams').update(stream.id, { settings: newSettings });
                setStream((prev: any) => ({ ...prev, settings: newSettings }));
            } catch (error) {
                console.error("Failed to ban user", error);
            }
        }
    }

    const unbanUser = async (userId: string) => {
        if (!stream) return;
        const currentSettings = stream.settings || {};
        const bannedUsers = currentSettings.banned_users || [];
        if (bannedUsers.includes(userId)) {
            const newSettings = { ...currentSettings, banned_users: bannedUsers.filter((id: string) => id !== userId) };
            try {
                await client.collection('streams').update(stream.id, { settings: newSettings });
                setStream((prev: any) => ({ ...prev, settings: newSettings }));
                setBannedUsersList(prev => prev.filter(u => u.id !== userId));
            } catch (error) {
                console.error("Failed to unban user", error);
            }
        }
    }

    const unmuteUser = async (userId: string) => {
        if (!stream) return;
        const currentSettings = stream.settings || {};
        const mutedUsers = currentSettings.muted_users || [];
        if (mutedUsers.includes(userId)) {
            const newSettings = { ...currentSettings, muted_users: mutedUsers.filter((id: string) => id !== userId) };
            try {
                await client.collection('streams').update(stream.id, { settings: newSettings });
                setStream((prev: any) => ({ ...prev, settings: newSettings }));
                setMutedUsersList(prev => prev.filter(u => u.id !== userId));
            } catch (error) {
                console.error("Failed to unmute user", error);
            }
        }
    }

    const sendMessage = async () => {
        if (isFetching) return;

        const user_id = client.authStore.model?.id;
        const message = inputRef.current?.value;

        if (message === '') {
            inputRef.current?.focus();
            return;
        }

        if (user_id && user_id !== '' && stream?.id && stream?.id !== '') {
            if (message?.startsWith(stream_settings.command_prefix)) {
                const command = message.split(' ')[0].replace(stream_settings.command_prefix, '');
                const commandExists = commands.find((c: StreamCommand) => c.name === command);

                if (commandExists && commandExists.is_enabled) {
                    if (!commandExists.is_public) {
                        setStreamChat((prev: any) => [...prev, { content: commandExists.response, stream: stream?.id, user: 'system', expand: { user: { username: 'system', avatar: null } } }]);

                        inputRef.current!.value = '';
                        setMatchingCommands([]);
                        return;
                    }

                    if (commandExists.is_public) {
                        await client.collection('stream_messages').create({ content: commandExists.response, stream: stream?.id, user: 'system' });

                        inputRef.current!.value = '';
                        setMatchingCommands([]);
                        return;
                    }

                }
            }

            await client.collection('stream_messages').create({ content: message, stream: stream?.id, user: user_id });

            inputRef.current!.value = '';
        }
    }

    const handleKeyDown = (e: any) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    }

    return (
        <CreatorLayout className="p-2 overflow-x-hidden relative">
            {!stream && <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center bg-black/60 backdrop-blur-lg z-[1001]">
                <span className="text-3xl">
                    <Loader2 className="animate-spin w-12 h-12" />
                </span>
            </div>}

            {stream?.exists === false && <div className="absolute top-0 left-0 w-full h-full flex justify-center items-center bg-black/60 backdrop-blur-lg z-[1001]">
                <span className="text-3xl">
                    You don't have any active stream
                </span>
            </div>}

            {stream?.exists !== false &&
                <ResponsiveGridLayout
                    className="z-10"
                    breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                    cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                    rowHeight={30}
                    isDraggable={true}
                    isResizable={true}
                    compactType="vertical"
                    onLayoutChange={(layout, layouts) => {
                        setLayoutSettings({ ...layout_settings, layout });
                    }}
                >
                    {layout_settings.session_info_enabled &&
                        <div className="bg-muted rounded-lg w-full overflow-scroll" key="session_info" data-grid={
                            getProperties(layout_settings.layout, 'session_info') ?? { x: 0, y: 0, w: 12, h: 4 }
                        }>
                            <div className="w-full h-fit bg-background/45 p-2">
                                <div className="flex space-x-2 items-center">
                                    <Radio />
                                    <span className="text-lg">Session info</span>
                                </div>
                            </div>

                            <div className="flex justify-between p-2">
                                <div className="flex flex-col">
                                    <Badge className="bg-primary w-min">Live</Badge>
                                    <span className="text-lg">{stream?.title}</span>
                                    <span className="text-lg">{stream?.description}</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-lg">{stream?.viewers}</span>
                                    <span className="text-lg text-gray-300">Viewers</span>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-lg">Start time</span>
                                    <span className="text-lg">End time</span>
                                </div>
                            </div>
                        </div>
                    }

                    {layout_settings.stream_enabled &&
                        <div className="bg-muted rounded-lg w-full overflow-hidden" key="stream" data-grid={
                            getProperties(layout_settings.layout, 'stream') ?? { x: 0, y: 4, w: 9, h: 17 }
                        }>
                            <div className="w-full h-10 bg-background/45 p-2 flex space-x-2 items-center">
                                <Radio />
                                <span className="text-lg">Stream preview</span>
                            </div>

                            {stream?.is_live &&
                                <div className="w-full h-full flex justify-center items-center my-2">
                                    <FLVPlayer url={`http://localhost:8000/live/${stream?.stream_key}.flv`} className="rounded-b-xl" />
                                </div>
                            }

                            {!stream?.is_live && <div className="w-full h-full flex justify-center items-center">
                                <span className="text-lg text-gray-300">Stream is offline</span>
                            </div>}
                        </div>
                    }

                    {layout_settings.chat_enabled &&
                        <div className="bg-muted rounded-lg overflow-hidden relative pb-24" key="chat" data-grid={
                            getProperties(layout_settings.layout, 'chat') ?? { x: 9, y: 4, w: 3, h: 17 }
                        }>
                            <div className="w-full h-10 bg-background/45 p-2 flex space-x-2 items-center justify-between">
                                <div className="flex space-x-2 items-center">
                                    <MessageSquareMore />
                                    <span className="text-lg">Chat</span>
                                </div>
                                <Dialog open={isModerationOpen} onOpenChange={setIsModerationOpen}>
                                    <DialogTrigger asChild>
                                        <div 
                                            className="cursor-pointer hover:bg-white/10 p-1 rounded transition-colors" 
                                            title="Moderation"
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <Shield className="w-5 h-5" />
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Moderation Management</DialogTitle>
                                            <DialogDescription>
                                                Manage banned and muted users.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <Tabs defaultValue="viewers" className="w-full">
                                            <TabsList className="grid w-full grid-cols-4">
                                                <TabsTrigger value="viewers">Viewers</TabsTrigger>
                                                <TabsTrigger value="banned">Banned</TabsTrigger>
                                                <TabsTrigger value="muted">Muted</TabsTrigger>
                                                <TabsTrigger value="settings">Settings</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="viewers" className="max-h-[300px] overflow-y-auto">
                                                {viewersList.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                                                        <User className="w-8 h-8 mb-2 opacity-50" />
                                                        <p>No viewers found</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {viewersList.map((user) => {
                                                            const isBanned = bannedUsersList.some(u => u.id === user.id);
                                                            const isMuted = mutedUsersList.some(u => u.id === user.id);

                                                            return (
                                                                <div key={user.id} className="flex items-center justify-between p-2 rounded bg-muted">
                                                                    <div className="flex items-center space-x-2">
                                                                        <Avatar className="w-8 h-8">
                                                                            <AvatarImage src={client.files.getUrl(user, user.avatar)} alt={user.username} />
                                                                            <AvatarFallback className="bg-primary text-primary-foreground">{user.username.charAt(0).toUpperCase()}</AvatarFallback>
                                                                        </Avatar>
                                                                        <span className="font-medium truncate max-w-[120px]" title={user.username}>{user.username}</span>
                                                                    </div>
                                                                    <div className="flex items-center space-x-1">
                                                                        {isMuted ? (
                                                                            <div onClick={() => unmuteUser(user.id)} className="cursor-pointer bg-yellow-500/10 hover:bg-yellow-500/20 p-1 rounded text-yellow-500 hover:text-yellow-600 transition-colors" title="Unmute">
                                                                                <VolumeX className="w-4 h-4" />
                                                                            </div>
                                                                        ) : (
                                                                            <div onClick={() => muteUser(user.id)} className="cursor-pointer hover:bg-white/10 p-1 rounded transition-colors" title="Mute">
                                                                                <VolumeX className="w-4 h-4 opacity-50 hover:opacity-100" />
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {isBanned ? (
                                                                            <div onClick={() => unbanUser(user.id)} className="cursor-pointer bg-destructive/10 hover:bg-destructive/20 p-1 rounded text-destructive hover:text-destructive transition-colors" title="Unban">
                                                                                <Trash className="w-4 h-4" />
                                                                            </div>
                                                                        ) : (
                                                                            <div onClick={() => banUser(user.id)} className="cursor-pointer hover:bg-white/10 p-1 rounded transition-colors" title="Ban">
                                                                                <Ban className="w-4 h-4 opacity-50 hover:opacity-100" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="banned" className="max-h-[300px] overflow-y-auto">
                                                {bannedUsersList.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                                                        <User className="w-8 h-8 mb-2 opacity-50" />
                                                        <p>No banned users</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {bannedUsersList.map((user) => (
                                                            <div key={user.id} className="flex items-center justify-between p-2 rounded bg-muted">
                                                                <span className="font-medium">{user.username}</span>
                                                                <div onClick={() => unbanUser(user.id)} className="cursor-pointer hover:bg-destructive/20 p-1 rounded text-destructive hover:text-destructive transition-colors" title="Unban">
                                                                    <Trash className="w-4 h-4" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="muted" className="max-h-[300px] overflow-y-auto">
                                                {mutedUsersList.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
                                                        <User className="w-8 h-8 mb-2 opacity-50" />
                                                        <p>No muted users</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {mutedUsersList.map((user) => (
                                                            <div key={user.id} className="flex items-center justify-between p-2 rounded bg-muted">
                                                                <span className="font-medium">{user.username}</span>
                                                                <div onClick={() => unmuteUser(user.id)} className="cursor-pointer hover:bg-yellow-500/20 p-1 rounded text-yellow-500 hover:text-yellow-600 transition-colors" title="Unmute">
                                                                    <VolumeX className="w-4 h-4" />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </TabsContent>
                                            <TabsContent value="settings" className="space-y-4 pt-4">
                                                <div className="flex items-center justify-between space-x-2">
                                                    <div className="flex flex-col space-y-1">
                                                        <Label htmlFor="slow-mode">Slow Mode</Label>
                                                        <span className="text-xs text-muted-foreground">Limit how often users can send messages.</span>
                                                    </div>
                                                    <Switch 
                                                        id="slow-mode" 
                                                        checked={stream_settings?.slow_mode_enabled || false} 
                                                        onCheckedChange={(checked) => updateSettings({ slow_mode_enabled: checked })}
                                                    />
                                                </div>
                                                
                                                {stream_settings?.slow_mode_enabled && (
                                                    <div className="flex items-center justify-between space-x-2 animate-accordion-down">
                                                         <Label htmlFor="slow-mode-delay">Delay (seconds)</Label>
                                                         <Input 
                                                             id="slow-mode-delay" 
                                                             type="number" 
                                                             min="1"
                                                             className="w-20"
                                                             defaultValue={stream_settings?.slow_mode_delay || 5}
                                                             onBlur={(e) => {
                                                                 const val = parseInt(e.target.value);
                                                                 if (!isNaN(val) && val > 0) {
                                                                     updateSettings({ slow_mode_delay: val });
                                                                 }
                                                             }}
                                                         />
                                                    </div>
                                                )}
                                            </TabsContent>
                                        </Tabs>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            {streamChat.length === 0 && <div className="w-full h-full flex justify-center items-center">
                                <span className="text-lg text-gray-300">No messages yet</span>
                            </div>}

                            {streamChat.length > 0 && <div className="w-full h-full overflow-scroll">
                                {streamChat.map((message: any) => {
                                    return (
                                        <div key={message.id} className="flex space-x-2 p-2 group items-start hover:bg-white/5 transition-colors">
                                            <Avatar>
                                                <AvatarImage src={client.files.getUrl(message.expand?.user, message.expand?.user?.avatar)} />
                                                <AvatarFallback className="bg-primary text-primary-foreground">{message.expand?.user?.username.charAt(0).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col grow">
                                                <span className="text-lg font-bold">{message.expand.user.username}</span>
                                                <span className="text-lg break-all">{message.content}</span>
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <div 
                                                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded cursor-pointer transition-opacity"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
                                                    </div>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuLabel>Moderation</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => deleteMessage(message.id)} className="cursor-pointer">
                                                        <Trash className="mr-2 h-4 w-4" />
                                                        Delete Message
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => muteUser(message.expand.user.id)} className="cursor-pointer">
                                                        <VolumeX className="mr-2 h-4 w-4" />
                                                        Mute User
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => banUser(message.expand.user.id)} className="cursor-pointer">
                                                        <Ban className="mr-2 h-4 w-4" />
                                                        Ban User
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )
                                })}
                            </div>}

                            {matchingCommands.length > 0 && (
                                <div className="flex flex-col absolute bottom-14 w-full">
                                    {matchingCommands.map((command, index) => (
                                        <div key={index} className="bg-muted hover:bg-muted p-2 text-white font-bold first:rounded-t-xl first:border-t w-full px-4 cursor-pointer" 
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={
                                            () => {
                                                const input = inputRef.current;
                                                if (input) {
                                                    input.value = "/" + command.name;
                                                    input.focus();
                                                }
                                            }
                                        }>{command.name}</div>
                                    ))}
                                </div>
                            )}
                            <div className="w-full p-4 absolute bottom-0 left-0">
                                <Input placeholder="Send a message..." className="bg-muted placeholder:text-stone-400 focus-visible:ring-accent" required ref={inputRef} onKeyDown={handleKeyDown} disabled={isFetching} onChange={
                                    (e) => {
                                        const value = e.target.value;
                                        if (value.startsWith(stream?.settings?.command_prefix)) {
                                            const command = value.split(' ')[0].replace(stream?.settings?.command_prefix, '');
                                            const matching = commands.filter((c: StreamCommand) => c.name.includes(command));
                                            setMatchingCommands(matching);
                                        } else {
                                            setMatchingCommands([]);
                                        }
                                    }
                                } />
                                <div className={`absolute right-5 top-1/2 transform -translate-y-1/2 flex space-x-1 ${isFetching ? 'text-gray-500 cursor-not-allowed' : ''}`}>
                                    <div className={`rounded-full transition-all p-1 cursor-pointer ${isFetching ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-background/80 hover:text-accent'}`} onMouseDown={(e) => e.stopPropagation()}>
                                        <Gift />
                                    </div>
                                    <div className={`rounded-full transition-all p-1 cursor-pointer ${isFetching ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-background/80 hover:text-accent'}`} onMouseDown={(e) => e.stopPropagation()}>
                                        <Smile />
                                    </div>
                                    <div className={`rounded-xl transition-all p-1 cursor-pointer ${isFetching ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-background/80 hover:text-accent'}`} onClick={sendMessage} onMouseDown={(e) => e.stopPropagation()}>
                                        <SendHorizontal />
                                    </div>
                                </div>
                            </div>
                        </div>
                    }

                    {layout_settings.quick_actions_enabled &&
                        <div className="bg-muted rounded-lg w-full" key="quick_actions" data-grid={
                            getProperties(layout_settings.layout, 'quick_actions') ?? { x: 0, y: 5, w: 12, h: 4 }
                        }>
                            <div className="w-full h-10 bg-background/45 p-2">
                                <div className="flex space-x-2 items-center">
                                    <Radio />
                                    <span className="text-lg">Quick actions</span>
                                </div>
                            </div>
                        </div>
                    }

                    {layout_settings.activity_enabled &&
                        <div className="bg-muted rounded-lg w-full" key="activity" data-grid={
                            getProperties(layout_settings.layout, 'activity') ?? { x: 0, y: 5, w: 6, h: 4 }
                        }>
                            <div className="w-full h-10 bg-background/45 p-2">
                                <div className="flex space-x-2 items-center">
                                    <Activity />
                                    <span className="text-lg">Activity Feed</span>
                                </div>
                            </div>
                        </div>
                    }
                </ResponsiveGridLayout>
            }
        </CreatorLayout>
    )
}

// the useLocalStorage hook is not supported by SSR, so we need to render the full page clientside
export default dynamic(() => Promise.resolve(Dashboard), {
    ssr: false
})