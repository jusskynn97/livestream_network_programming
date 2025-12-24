export interface StreamSettings {
    chat_enabled: boolean;
    slow_mode_enabled: boolean;
    slow_mode_delay: number;
    command_prefix: string;
    commands: StreamCommand[];
    muted_users?: string[];
    banned_users?: string[];
    save_stream?: boolean;
}

export interface StreamCommand {
    name: string;
    response: string;
    is_public: boolean;
    is_enabled: boolean;
}