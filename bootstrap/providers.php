<?php

use App\Providers\AppServiceProvider;
use App\Providers\FortifyServiceProvider;
use App\Providers\OidcServiceProvider;

return [
    AppServiceProvider::class,
    FortifyServiceProvider::class,
    OidcServiceProvider::class,
];
