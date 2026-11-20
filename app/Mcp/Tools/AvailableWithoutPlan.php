<?php

namespace App\Mcp\Tools;

/**
 * A tool an account without a paid plan may still call in SaaS mode (every
 * other tool answers with the paywall error, see CallToolWithAccess). Only for
 * tools that touch no planner data.
 */
interface AvailableWithoutPlan {}
