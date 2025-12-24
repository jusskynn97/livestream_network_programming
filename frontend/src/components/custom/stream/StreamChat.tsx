import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/pocketbase/createBrowserClient";
import { Gift, MoreVertical, SendHorizontal, Smile, Heart, ThumbsUp, Laugh, Angry, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type StreamChatProps = {
    stream: any;
    stream_key: string | null;
    stream_id: string | null;
    stream_settings: any;
};

type FlyingEmotion = {
    id: string;
    emoji: string;
    x: number;
    timestamp: number;
};

const EMOTIONS = [
    { emoji: '❤️', icon: Heart, color: 'text-red-500' },
    { emoji: '👍', icon: ThumbsUp, color: 'text-blue-500' },
    { emoji: '😂', icon: Laugh, color: 'text-yellow-500' },
    { emoji: '😍', icon: Heart, color: 'text-pink-500' },
    { emoji: '🔥', icon: Sparkles, color: 'text-orange-500' },
    { emoji: '😢', icon: null, color: 'text-blue-400' },
    { emoji: '😠', icon: Angry, color: 'text-red-600' },
    { emoji: '🎉', icon: Sparkles, color: 'text-purple-500' },
];

export default function StreamChat({ stream, stream_key, stream_id, stream_settings }: StreamChatProps) {
    const client = createBrowserClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollableRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [streamChat, setStreamChat] = useState<any[]>([]);
    const [isFetching, setIsFetching] = useState<boolean>(true);
    const [chat_delay, setChatDelay] = useState<number>(0);
    const [emotion_delay, setEmotionDelay] = useState<number>(0);
    const [matchingCommands, setMatchingCommands] = useState<StreamCommand[]>([]);
    const [showEmotionPicker, setShowEmotionPicker] = useState<boolean>(false);
    const [flyingEmotions, setFlyingEmotions] = useState<FlyingEmotion[]>([]);
    const { chat_enabled, slow_mode_enabled, slow_mode_delay } = stream_settings as StreamSettings;
    const user_id = client.authStore.model?.id;
    const isBanned = user_id && stream_settings?.banned_users?.includes(user_id);
    const isMuted = user_id && stream_settings?.muted_users?.includes(user_id);
    const commands = stream_settings?.commands ?? [];
    const EMOTION_DELAY = 3; // 3 seconds delay between emotions

    // WebSocket connection for emotions
    useEffect(() => {
        if (!chat_enabled || !stream_id) return;

        // Connect to WebSocket server
        const ws = new WebSocket(`ws://localhost:8080/stream/${stream_id}/emotions`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connected for emotions');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'emotion' && data.emoji) {
                    addFlyingEmotion(data.emoji);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
        };

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [stream_id, chat_enabled]);

    useEffect(() => {
        if (!chat_enabled) return;

        if (scrollableRef.current) {
            const scroll = scrollableRef.current;
            scroll.scrollTop = scroll.scrollHeight;
        }
    }, [streamChat]);

    useEffect(() => {
        if (!chat_enabled) return;
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
                setStreamChat((prev) => [...prev, record]);
            }

            if (action === 'delete') {
                setStreamChat((prev) => prev.filter((item) => item.id !== record.id));
            }
        });

        fetchStreamChat();

        return () => {
            client.collection('stream_messages').unsubscribe(`*`);
        }
    }, [stream_id]);

    const addFlyingEmotion = (emoji: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        const x = Math.random() * 80 + 10; // Random position between 10% and 90%
        
        setFlyingEmotions(prev => [...prev, { id, emoji, x, timestamp: Date.now() }]);

        // Remove emotion after animation completes (3 seconds)
        setTimeout(() => {
            setFlyingEmotions(prev => prev.filter(e => e.id !== id));
        }, 3000);
    };

    const sendEmotion = async (emoji: string) => {
        if (!chat_enabled || emotion_delay > 0 || isBanned || isMuted || !user_id || !stream_id) return;

        // Send emotion through WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'emotion',
                emoji: emoji,
                user_id: user_id,
                stream_id: stream_id
            }));

            setEmotionDelay(EMOTION_DELAY);
            setShowEmotionPicker(false);
        } else {
            console.error('WebSocket is not connected');
        }
    };

    useEffect(() => {
        if (emotion_delay > 0) {
            const interval = setInterval(() => {
                setEmotionDelay((prev) => prev - 1);
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [emotion_delay]);

    const checkToxicity = async (text: string): Promise<boolean> => {
        try {
            const response = await fetch('http://localhost:5000/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.toxic ?? false;
            }
        } catch (error) {
            console.error('Error checking toxicity:', error);
        }
        return false;
    }

    const sendMessage = async () => {
        if (isFetching) return;
        if (!chat_enabled) return;
        if (chat_delay > 0) return;
        if (isBanned || isMuted) return;

        const user_id = client.authStore.model?.id;
        const message = inputRef.current?.value;

        if (message === '') {
            inputRef.current?.focus();
            return;
        }

        if (user_id && user_id !== '' && stream_id && stream_id !== '') {
            if (message?.startsWith(stream_settings.command_prefix)) {
                const command = message.split(' ')[0].replace(stream_settings.command_prefix, '');
                const commandExists = commands.find((c: StreamCommand) => c.name === command);

                if (commandExists && commandExists.is_enabled) {
                    if (!commandExists.is_public) {
                        setStreamChat((prev) => [...prev, { content: commandExists.response, stream: stream_id, user: 'system', expand: { user: { username: 'system', avatar: null } } }]);

                        inputRef.current!.value = '';
                        setMatchingCommands([]);
                        return;
                    }

                    if (commandExists.is_public) {
                        await client.collection('stream_messages').create({ content: commandExists.response, stream: stream_id, user: 'system' });

                        inputRef.current!.value = '';
                        setMatchingCommands([]);
                        return;
                    }
                }
            }

            const isToxic = await checkToxicity(message);
            await client.collection('stream_messages').create({ content: message, stream: stream_id, user: user_id, is_toxic: isToxic });

            inputRef.current!.value = '';
        }

        if (slow_mode_enabled) {
            setChatDelay(slow_mode_delay);
        }
    }

    useEffect(() => {
        if (chat_delay > 0) {
            const interval = setInterval(() => {
                setChatDelay((prev) => prev - 1);
            }, 1000);

            return () => {
                clearInterval(interval);
            }
        }
    }, [chat_delay]);

    const handleKeyDown = (e: any) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    }

    return (
        <div className="flex flex-col w-full rounded-xl bg-transparent border border-border h-80 sm:h-96 md:h-[35rem] xl:h-[50rem]">
            <div className="w-full h-12 bg-muted rounded-t-xl flex items-center pl-4 pr-2 justify-between">
                <h1 className="font-bold text-xl">Live chat</h1>
                <div className="rounded-full hover:bg-background/40 transition-all p-2 cursor-pointer my-1">
                    <MoreVertical />
                </div>
            </div>
            <div className="h-full overflow-y-scroll relative" ref={scrollableRef}>
                {/* Flying Emotions Container */}
                <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                    {flyingEmotions.map((emotion) => (
                        <div
                            key={emotion.id}
                            className="absolute text-4xl animate-fly-up"
                            style={{
                                left: `${emotion.x}%`,
                                bottom: '0',
                                animation: 'flyUp 3s ease-out forwards'
                            }}
                        >
                            {emotion.emoji}
                        </div>
                    ))}
                </div>

                {!chat_enabled && <div className="flex justify-center items-center h-full"><h1 className="text-4xl font-bold text-white/80">Chat is disabled</h1></div>}
                {chat_enabled && isFetching && <LoadingSkeleton />}
                {chat_enabled && streamChat.map((message: any, index: number) => (
                    <div key={index} className="flex items-center px-4 py-2 space-x-4 w-full hover:bg-muted/80">
                        <Avatar>
                            <AvatarImage src={client.files.getUrl(message?.expand?.user, message?.expand?.user?.avatar)} />
                            <AvatarFallback className="bg-accent text-accent-content">{message?.expand?.user?.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <h1 className="font-bold">{message?.expand?.user?.username}</h1>
                            <p>{message.is_toxic ? '*'.repeat(message.content.length) : message.content}</p>
                        </div>
                    </div>
                ))}
            </div>
            {chat_enabled && !isBanned && !isMuted && (
                <div className="flex mt-auto flex-col">
                    <div className="chat-delay px-4">
                        {chat_delay > 0 && <p className="text-white text-sm mb-2">Slow mode enabled. You can send a message in {chat_delay} seconds.</p>}
                        {emotion_delay > 0 && <p className="text-yellow-500 text-sm mb-2">Emotion cooldown: {emotion_delay}s</p>}
                    </div>
                    {matchingCommands.length > 0 && (
                        <div className="flex flex-col ">
                            {matchingCommands.map((command, index) => (
                                <div key={index} className="bg-background/80 hover:bg-muted p-2 text-white font-bold first:rounded-t-xl first:border-t w-full px-4 cursor-pointer" onClick={
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
                    
                    {/* Emotion Picker */}
                    {showEmotionPicker && (
                        <div className="bg-muted border-t border-border p-3 grid grid-cols-4 gap-2">
                            {EMOTIONS.map((emotion, index) => (
                                <button
                                    key={index}
                                    onClick={() => sendEmotion(emotion.emoji)}
                                    disabled={emotion_delay > 0}
                                    className={`text-2xl p-2 rounded-lg transition-all hover:bg-background hover:scale-110 ${
                                        emotion_delay > 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                >
                                    {emotion.emoji}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="w-full relative p-4">
                        <Input placeholder="Send a message..." className="bg-muted placeholder:text-stone-400 focus-visible:ring-accent" required ref={inputRef} onKeyDown={handleKeyDown} disabled={isFetching || chat_delay > 0} onChange={
                            (e) => {
                                const value = e.target.value;
                                if (value.startsWith(stream_settings.command_prefix)) {
                                    const command = value.split(' ')[0].replace(stream_settings.command_prefix, '');
                                    const matching = commands.filter((c: StreamCommand) => c.name.includes(command));
                                    setMatchingCommands(matching);
                                } else {
                                    setMatchingCommands([]);
                                }
                            }
                        } />
                        <div className={`absolute right-5 top-1/2 transform -translate-y-1/2 flex space-x-1 ${isFetching || chat_delay > 0 ? 'text-gray-500 cursor-not-allowed' : ''}`}>
                            <div className={`rounded-full transition-all p-1 cursor-pointer ${isFetching || chat_delay > 0 ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-background/80 hover:text-accent'}`}>
                                <Gift />
                            </div>
                            <div 
                                className={`rounded-full transition-all p-1 cursor-pointer relative ${
                                    isFetching || chat_delay > 0 
                                        ? 'text-gray-500 cursor-not-allowed' 
                                        : emotion_delay > 0 
                                            ? 'text-yellow-500 cursor-not-allowed'
                                            : 'text-white hover:bg-background/80 hover:text-accent'
                                }`}
                                onClick={() => emotion_delay === 0 && setShowEmotionPicker(!showEmotionPicker)}
                            >
                                <Smile />
                                {emotion_delay > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                        {emotion_delay}
                                    </span>
                                )}
                            </div>
                            <div className={`rounded-xl transition-all p-1 cursor-pointer ${isFetching || chat_delay > 0 ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-background/80 hover:text-accent'}`} onClick={sendMessage}>
                                <SendHorizontal />
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {chat_enabled && isBanned && (
                <div className="flex justify-center items-center h-20 bg-destructive/10 text-destructive font-bold p-4">
                    You are banned from this chat.
                </div>
            )}
            {chat_enabled && isMuted && (
                <div className="flex justify-center items-center h-20 bg-yellow-500/10 text-yellow-500 font-bold p-4">
                    You are muted in this chat.
                </div>
            )}
            
            <style>{`
                @keyframes flyUp {
                    0% {
                        transform: translateY(0) scale(0.5);
                        opacity: 0;
                    }
                    10% {
                        opacity: 1;
                        transform: translateY(-10%) scale(1);
                    }
                    100% {
                        transform: translateY(-100vh) scale(0.8);
                        opacity: 0;
                    }
                }
                
                .animate-fly-up {
                    animation: flyUp 3s ease-out forwards;
                }
            `}</style>
        </div>
    );
}

const LoadingSkeleton = () => {
    return (
        <>
            {[...Array(10)].map((_, index) => (
                <div key={index} className="flex items-center px-4 py-2 space-x-4 w-full min-h-12">
                    <Skeleton className="rounded-full h-10 w-10" />
                    <div className="flex flex-col space-y-1">
                        <Skeleton className="w-20 h-5" />
                        <Skeleton className="w-40 h-5" />
                    </div>
                </div>
            ))}
        </>
    );
}

export { LoadingSkeleton as StreamChatSkeleton };