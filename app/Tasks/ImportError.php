<?php

namespace App\Tasks;

/**
 * An export file that cannot be imported; the message says why (not JSON, not a Plain Week file, an unsupported
 * version, or the first invalid task).
 */
final class ImportError extends TaskDomainException {}
