# Dockerfile for Linux E2E Tests with systemd
# Provides Ubuntu environment with full systemd support for service testing

FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker

# Install systemd and required packages
RUN apt-get update && apt-get install -y \
    # Systemd
    systemd \
    systemd-sysv \
    # DNS and networking
    dnsmasq \
    iptables \
    iproute2 \
    ipset \
    dnsutils \
    conntrack \
    curl \
    wget \
    # System utilities
    libcap2-bin \
    sudo \
    # Firefox for extension tests
    firefox \
    # Python for native messaging host
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Remove unnecessary systemd services that won't work in container
RUN rm -f /lib/systemd/system/multi-user.target.wants/* \
    /etc/systemd/system/*.wants/* \
    /lib/systemd/system/local-fs.target.wants/* \
    /lib/systemd/system/sockets.target.wants/*udev* \
    /lib/systemd/system/sockets.target.wants/*initctl* \
    /lib/systemd/system/sysinit.target.wants/systemd-tmpfiles-setup* \
    /lib/systemd/system/systemd-update-utmp*

# Disable systemd-resolved so dnsmasq can use port 53
RUN systemctl mask systemd-resolved.service systemd-resolved.socket

# Create working directory
WORKDIR /openpath

# Copy entire project
COPY . .

# Make scripts executable
RUN chmod +x linux/*.sh linux/scripts/**/*.sh tests/e2e/*.sh linux/lib/*.sh 2>/dev/null || true

# Create the test runner service
RUN echo '[Unit]\n\
    Description=E2E Test Runner\n\
    After=multi-user.target\n\
    \n\
    [Service]\n\
    Type=oneshot\n\
    ExecStart=/openpath/tests/e2e/docker-e2e-runner.sh\n\
    StandardOutput=journal+console\n\
    StandardError=journal+console\n\
    RemainAfterExit=yes\n\
    \n\
    [Install]\n\
    WantedBy=multi-user.target' > /etc/systemd/system/e2e-tests.service

RUN systemctl enable e2e-tests.service

# Use systemd as entrypoint
STOPSIGNAL SIGRTMIN+3
VOLUME ["/sys/fs/cgroup"]
CMD ["/lib/systemd/systemd"]
