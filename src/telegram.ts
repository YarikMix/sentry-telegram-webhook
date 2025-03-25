import { type Logger } from "pino";

export type SendMessageOptions = {
    chatId: number;
    topicId?: number;
    message: string;
    parseMode?: "HTML" | "MarkdownV2";
    disableLinkPreview: boolean;
    protectContent: boolean;
    logger: Logger;
};

export async function sendMessage(botToken: string, options: SendMessageOptions, signal?: AbortSignal): Promise<void> {
    if (botToken === "" || options.message === "") {
        options.logger.error({ msg: "invalid bot token or message", botToken, options });
        return;
    }

    options.logger.trace({ msg: "sending message to telegram", options, botToken });

    const requestBody = {
        chat_id: options.chatId,
        message_thread_id: options.topicId,
        text: options.message,
        parse_mode: options.parseMode ?? "MarkdownV2",
    };

    const requestUrl = new URL(`https://api.telegram.org/bot${botToken}/sendMessage`);

    const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: signal ?? AbortSignal.timeout(3 * 60 * 1000),
    });

    if (!response.ok) {
        const responseBody = await response.text();
        const responseHeaders: Record<string, unknown> = {};
        for (const [key, value] of response.headers) {
            responseHeaders[key] = value;
        }
        options.logger.warn({
            msg: "failed to send message to telegram",
            response_body: responseBody,
            status: response.status,
            headers: responseHeaders,
            request_body: requestBody,
        });
        return;
    }

    options.logger.trace({ msg: "sent message to telegram", response_body: await response.text() });
}
