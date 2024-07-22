FROM ghcr.io/foundry-rs/foundry:nightly-c2e529786c07ee7069cefcd4fe2db41f0e46cef6

WORKDIR /app

COPY . .

RUN forge build

ENTRYPOINT ["forge", "script"]
