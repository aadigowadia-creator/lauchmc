export class ForgeNotInstalledError extends Error {
  public readonly mcVersion: string;
  public readonly forgeVersion: string;
  public readonly minecraftDir: string;
  public readonly canAutoInstall: boolean = true;

  constructor(
    message: string,
    mcVersion: string,
    forgeVersion: string,
    minecraftDir: string
  ) {
    super(message);
    this.name = 'ForgeNotInstalledError';
    this.mcVersion = mcVersion;
    this.forgeVersion = forgeVersion;
    this.minecraftDir = minecraftDir;
  }
}