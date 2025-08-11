import * as process from "node:process";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { ZodError } from "zod";
import { issueAlertSchema, metricAlertSchema } from "./schemas.js";
import { sendMessage } from "./telegram.js";

const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
});

const configuration = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    telegramGroupId: Number.parseInt(process.env.TELEGRAM_GROUP_ID ?? ""),
    telegramTopicId: process.env.TELEGRAM_TOPIC_ID ? Number.parseInt(process.env.TELEGRAM_TOPIC_ID) : undefined,
    logger,
};

const app = new Hono();

app.onError((error, c) => {
    if (error instanceof ZodError) {
        logger.warn({ msg: "invalid request body", error: error.issues });
        return c.json({ message: "invalid request body", error: error.issues }, 400);
    }

    if (error instanceof TypeError) {
        logger.warn({
            msg: "invalid request body",
            error: { cause: error.cause, stack: error.stack, name: error.name, message: error.message },
        });
        return c.json({ message: "unhandled error", error: error.message }, 400);
    }

    if (error instanceof Error) {
        logger.error({ msg: "unhandled error", error: error.message });
        return c.json({ message: "unhandled error", error: error.message }, 500);
    }

    logger.error({ msg: "unhandled error", error });
    return c.json({ message: "unhandled error", error }, 500);
});

app.get("/", (c) => {
    return c.text(".", 200);
});

app.post("/sentry/webhook", pinoLogger({ pino: logger }), async (c) => {
    const requestBody = await c.req.json();
    const sentryHookResource = c.req.header("sentry-hook-resource");

    switch (sentryHookResource) {
        case "event_alert": {
            const validatedRequestBody = issueAlertSchema.parse(requestBody);
            let message =
                "<b>" + validatedRequestBody.data.event.title + " (" + validatedRequestBody.data.event.type + ")</b>\n";

            const environment: string | undefined = validatedRequestBody.data.event.tags
                ?.find((tag) => tag.at(0) === "environment")
                ?.slice(1)
                .join(" ");
            if (environment !== undefined && environment !== "") {
                message += "\n<b>Environment:</b> " + environment;
            }

            message +=
                "\n<b>Date:</b> " +
                validatedRequestBody.data.event.timestamp.toLocaleString("ru-RU", {
                    dateStyle: "long",
                    timeStyle: "long",
                    hour12: false,
                    timeZone: "Europe/Moscow",
                });

            message += "\n<b>Detail:</b> " + validatedRequestBody.data.event.web_url;

            sendMessage(configuration.telegramBotToken, {
                chatId: configuration.telegramGroupId,
                topicId: configuration.telegramTopicId,
                message,
                parseMode: "HTML",
                disableLinkPreview: true,
                protectContent: false,
                logger: logger,
            }).catch((error) => logger.error({ msg: "failed to send event alert to telegram", error }));
            break;
        }
        case "metric_alert": {
            const validatedRequestBody = metricAlertSchema.parse(requestBody);
            let message = `<b>${validatedRequestBody.data.description_title} (${validatedRequestBody.data.description_text})</b>\n`;
            message += `\nProject: ${validatedRequestBody.data.metric_alert.projects?.join(", ") ?? "Unknown"}`;
            message += `\n<b>Date:</b> ${validatedRequestBody.data.metric_alert.date_detected?.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "long", hour12: false, timeZone: "Europe/Moscow" }) ?? "no data"}`;
            message += "\n<b>Detail:</b> " + validatedRequestBody.data.web_url;

            sendMessage(configuration.telegramBotToken, {
                chatId: configuration.telegramGroupId,
                topicId: configuration.telegramTopicId,
                message,
                parseMode: "HTML",
                disableLinkPreview: true,
                protectContent: false,
                logger: logger,
            }).catch((error) => logger.error({ msg: "failed to send metric alert to telegram", error }));
            break;
        }
        default: {
            c.get("logger").debug({
                msg: "dropping unrecognized sentry-hook-resource",
                sentryHookResource,
                requestBody,
            });
        }
    }

    return c.json({ message: "ok" }, 200);
});

serve(
    {
        fetch: app.fetch,
        port: Number.parseInt(process.env.HTTP_PORT ?? "6500"),
        hostname: process.env.HTTP_HOSTNAME ?? "0.0.0.0",
    },
    (info) => {
        logger.info({ msg: "server started", info });
    },
);
