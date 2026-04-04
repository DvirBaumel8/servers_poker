import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

@Injectable()
export class CloudStorageService implements OnModuleInit {
  private readonly logger = new Logger(CloudStorageService.name);
  private client!: S3Client;
  private bucket!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.bucket = this.configService.get<string>(
      "AWS_S3_BUCKET",
      "poker-archive",
    );
    const region = this.configService.get<string>("AWS_S3_REGION", "us-east-1");
    const endpoint = this.configService.get<string>("AWS_S3_ENDPOINT");

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = { region };

    if (endpoint) {
      clientConfig.endpoint = endpoint;
      clientConfig.forcePathStyle = true;
    }

    this.client = new S3Client(clientConfig);
    this.logger.log(
      `S3 client initialised (bucket=${this.bucket}, region=${region}${endpoint ? `, endpoint=${endpoint}` : ""})`,
    );
  }

  async upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentEncoding: "gzip",
      }),
    );

    const etag = result.ETag ?? "unknown";
    this.logger.debug(`Uploaded ${key} (ETag: ${etag}, ${body.length} bytes)`);
    return etag;
  }

  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    const stream = result.Body;
    if (!stream) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }
}
