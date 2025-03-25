import { type Logger } from "pino";
import { z } from "zod";

export type SentryConfig = {
    sentryUrl?: string;
    sentryOrganizationSlug?: string;
    sentryIntegrationToken?: string;
    logger: Logger;
};

const projectResponseSchema = z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    platform: z.string(),
});

type SentryProject = {
    name: string;
    platform: string;
};

const projectResolverCache = new Map<number, SentryProject>();

export async function resolveProjectName(
    projectId: number,
    config: SentryConfig,
    signal?: AbortSignal,
): Promise<SentryProject | null> {
    if (!config.sentryOrganizationSlug || !config.sentryIntegrationToken) {
        return null;
    }

    const cachedProject = projectResolverCache.get(projectId);
    if (cachedProject !== undefined) {
        return cachedProject;
    }

    config.logger.trace({
        msg: "resolving project name",
        projectId,
        url: `${config.sentryUrl ?? "https://sentry.io"}/api/0/projects/${config.sentryOrganizationSlug}/${projectId}/`,
    });
    const response = await fetch(
        `${config.sentryUrl ?? "https://sentry.io"}/api/0/projects/${config.sentryOrganizationSlug}/${projectId}/`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${config.sentryIntegrationToken}`,
                Accept: "application/json",
            },
            signal: signal ?? AbortSignal.timeout(1 * 60 * 1000),
        },
    );

    if (!response.ok) {
        const responseBody = await response.text();
        config.logger.warn({ msg: "failed to resolve project name", projectId, responseBody, status: response.status });
        return null;
    }

    const data = await response.json();

    const validatedResponseBody = projectResponseSchema.parse(data);

    projectResolverCache.set(projectId, validatedResponseBody);

    config.logger.trace({ msg: "resolved project name", projectId, validatedResponseBody });

    return {
        name: validatedResponseBody.name,
        platform: validatedResponseBody.platform,
    };
}
