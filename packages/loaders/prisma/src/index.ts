import { UrlLoader, LoadFromUrlOptions } from '@graphql-toolkit/url-loader';
import { join } from 'path';
import { homedir } from 'os';
import { PrismaDefinitionClass, Environment } from 'prisma-yml';

interface PrismaLoaderOptions extends LoadFromUrlOptions {
  envVars?: { [key: string]: string };
  graceful?: boolean;
}

export class PrismaLoader extends UrlLoader {
  loaderId() {
    return 'prisma';
  }
  async canLoad(prismaConfigFilePath: string) {
    return typeof prismaConfigFilePath === 'string' && prismaConfigFilePath.endsWith('prisma.yml');
  }
  async load(prismaConfigFilePath: string, options: PrismaLoaderOptions) {
    const { graceful, envVars = {} } = options || {};
    const home = homedir();
    const env = new Environment(home);
    await env.load();
    const joinedYmlPath = join(process.cwd(), prismaConfigFilePath);
    const definition = new PrismaDefinitionClass(env, joinedYmlPath, envVars);
    await definition.load({}, undefined, graceful);
    const serviceName = definition.service!;
    const stage = definition.stage!;
    const clusterName = definition.cluster;
    if (!clusterName) {
      throw new Error(`No cluster set. Please set the "cluster" property in your prisma.yml`);
    }
    const cluster = await definition.getCluster();
    if (!cluster) {
      throw new Error(
        `Cluster ${clusterName} provided in prisma.yml could not be found in global ~/.prisma/config.yml.
      Please check in ~/.prisma/config.yml, if the cluster exists.
      You can use \`docker-compose up -d\` to start a new cluster.`
      );
    }
    const token = definition.getToken(serviceName, stage);
    const url = cluster.getApiEndpoint(serviceName, stage, definition.getWorkspace() || undefined);
    const headers = token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined;
    return super.load(url, { headers });
  }
}
