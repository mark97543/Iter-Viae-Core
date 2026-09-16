FROM alpine:latest

ARG PB_VERSION=0.22.20

RUN apk add --no-cache \
    ca-certificates \
    unzip \
    wget \
    zip \
    zstd

# Download and unzip PocketBase executable
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

# Create data volume directory and migrations folder
RUN mkdir -p /pb/pb_data /pb/pb_migrations

# Copy automated schema migrations and entrypoint script into container image
COPY pb_migrations /pb/pb_migrations
COPY entrypoint.sh /pb/entrypoint.sh

RUN chmod +x /pb/entrypoint.sh

EXPOSE 8090

ENTRYPOINT ["/pb/entrypoint.sh"]
