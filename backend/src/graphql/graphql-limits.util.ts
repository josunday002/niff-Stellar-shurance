import type { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_COMPLEXITY = 250;

/** Resolves depth/complexity caps from MAX_QUERY_* with GRAPHQL_* fallbacks. */
export function resolveGraphqlLimits(config: ConfigService): {
  maxDepth: number;
  maxComplexity: number;
} {
  const maxDepth =
    config.get<number>('MAX_QUERY_DEPTH') ??
    config.get<number>('GRAPHQL_MAX_DEPTH', DEFAULT_MAX_DEPTH);
  const maxComplexity =
    config.get<number>('MAX_QUERY_COMPLEXITY') ??
    config.get<number>('GRAPHQL_MAX_COMPLEXITY', DEFAULT_MAX_COMPLEXITY);

  return { maxDepth, maxComplexity };
}
