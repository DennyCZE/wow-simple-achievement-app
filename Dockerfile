FROM php:8.3-apache

# Install SQLite support (curl is included in the base image)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsqlite3-dev \
    && docker-php-ext-install pdo pdo_sqlite \
    && rm -rf /var/lib/apt/lists/*

# Apache: enable rewrite, point DocumentRoot at /var/www/public
RUN a2enmod rewrite \
    && sed -ri 's!/var/www/html!/var/www/public!g' /etc/apache2/sites-available/000-default.conf \
    && sed -ri 's!/var/www/html!/var/www/public!g' /etc/apache2/apache2.conf

# Allow .htaccess overrides on /var/www/public
RUN printf '\n<Directory /var/www/public>\n    AllowOverride All\n    Require all granted\n</Directory>\n' \
    >> /etc/apache2/apache2.conf

# Data directory for SQLite (mounted as volume)
RUN mkdir -p /var/www/data && chown -R www-data:www-data /var/www

# Copy app
COPY src/    /var/www/src/
COPY public/ /var/www/public/

EXPOSE 80
