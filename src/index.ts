import 'phaser';

interface HexData {
    x: number;
    y: number;
    isPowerNode: boolean;
    isBlocker: boolean;
    energyColor: number | null;
    connections: number[];
}

class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload(): void {
        // Load any assets here if you add them later (e.g., fonts, images, audio)
        // this.load.bitmapFont('yourfont', 'assets/fonts/yourfont.png', 'assets/fonts/yourfont.xml');
        console.log("PreloadScene: Preloading assets...");
    }

    create(): void {
        console.log("PreloadScene: Assets loaded, starting MenuScene.");
        this.scene.start('MenuScene');
    }
}

class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        const gameWidth = this.cameras.main.width;
        const gameHeight = this.cameras.main.height;

        // Game Title
        this.add.text(gameWidth / 2, gameHeight * 0.2, 'NexusGrid', {
            // fontFamily: 'yourfont', // Use if you load a bitmap font
            fontSize: '64px',
            color: '#00ff00',
            align: 'center'
        }).setOrigin(0.5);

        // Instructions
        this.add.text(gameWidth / 2, gameHeight * 0.4, 
            'Goal: Create the largest cluster of connected hexagons.\nClick empty hexagons to claim them for your color.\nThe game ends when all non-blocker hexagons are filled.',
            {
                fontSize: '20px',
                color: '#ffffff',
                align: 'center',
                wordWrap: { width: gameWidth * 0.8 }
            }
        ).setOrigin(0.5);

        // Start Button
        const startButton = this.add.text(gameWidth / 2, gameHeight * 0.7, 'Start Game', {
            fontSize: '32px',
            color: '#ffffff',
            backgroundColor: '#008000',
            padding: { x: 20, y: 10 },
            align: 'center'
        }).setOrigin(0.5).setInteractive();

        startButton.on('pointerdown', () => {
            this.scene.start('GameScene');
        });

        startButton.on('pointerover', () => startButton.setStyle({ fill: '#00ff00' }));
        startButton.on('pointerout', () => startButton.setStyle({ fill: '#ffffff' }));
    }
}

class GameScene extends Phaser.Scene {
    private hexSize: number = 40;
    private grid!: Phaser.GameObjects.Group;
    private selectedHex: Phaser.GameObjects.Graphics | null = null;
    private hexDataMap: Map<Phaser.GameObjects.Graphics, HexData> = new Map();
    private currentPlayer: number = 0;
    private playerColors: number[] = [0xff0000, 0x0000ff];
    private powerNodes: Phaser.GameObjects.Graphics[] = [];
    private isAITurn: boolean = false;
    private gameOver: boolean = false;
    private blockerColor: number = 0x808080;

    private turnText!: Phaser.GameObjects.Text;
    private playerScoreText!: Phaser.GameObjects.Text;
    private aiScoreText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'GameScene' });
    }

    create(): void {
        this.cameras.main.setBackgroundColor('#000000');
        this.grid = this.add.group();
        this.hexDataMap.clear();
        this.powerNodes = [];
        this.currentPlayer = 0;
        this.isAITurn = false;
        this.gameOver = false;
        this.selectedHex = null;

        this.createHexGrid(8, 8);
        this.placePowerNodes();
        this.createUI();
        this.updateScoreDisplay();

        this.input.on('pointerdown', this.handleTouchStart, this);
        this.input.on('pointerup', this.handleTouchEnd, this);
        
        this.events.emit('playerChanged', this.currentPlayer);
    }

    private createUI(): void {
        const style = { fontSize: '24px', color: '#ffffff', backgroundColor: '#333333', padding: {x:10, y:5} };

        this.turnText = this.add.text(this.cameras.main.width / 2, 30, 'Your Turn', style).setOrigin(0.5, 0.5);
        
        this.playerScoreText = this.add.text(60, 30, 'You: 0', style).setOrigin(0, 0.5);
        this.aiScoreText = this.add.text(this.cameras.main.width - 60, 30, 'AI: 0', style).setOrigin(1, 0.5);

        this.events.on('playerChanged', (playerIndex: number) => {
            if (this.gameOver) return;
            if (playerIndex === 0) {
                this.turnText.setText('Your Turn');
                this.turnText.setColor(this.playerColors[0].toString(16).padStart(6, '0'));
            } else {
                this.turnText.setText('AI Thinking...');
                this.turnText.setColor(this.playerColors[1].toString(16).padStart(6, '0'));
                this.isAITurn = true;
                this.time.delayedCall(500, this.makeAIMove, [], this);
            }
        });
    }

    private updateScoreDisplay(): void {
        if (this.gameOver) return;
        const playerCluster = this.findLargestCluster(this.playerColors[0]);
        const aiCluster = this.findLargestCluster(this.playerColors[1]);
        this.playerScoreText.setText(`You: ${playerCluster}`);
        this.aiScoreText.setText(`AI: ${aiCluster}`);
    }

    private createHexGrid(rows: number, cols: number): void {
        const gameViewWidth = this.cameras.main.width * 0.9;
        const gameViewHeight = this.cameras.main.height * 0.8;

        this.hexSize = Math.min(gameViewWidth / (cols * 1.5), gameViewHeight / (rows * Math.sqrt(3))) * 0.95;

        const gridWidth = cols * this.hexSize * 1.5 - (this.hexSize * 0.75);
        const gridHeight = rows * this.hexSize * Math.sqrt(3) - (this.hexSize * Math.sqrt(3)/2) ;

        const startX = (this.cameras.main.width - gridWidth) / 2 + this.hexSize * 0.75;
        const startY = (this.cameras.main.height - gridHeight) / 2 + (this.hexSize * Math.sqrt(3)/2) + 50;

        const numberOfBlockers = Math.floor(rows * cols * 0.20);
        let blockersToPlace = numberOfBlockers;
        const potentialBlockerPositions: {r: number, c: number}[] = [];
        for(let r=0; r<rows; r++) for(let c=0; c<cols; c++) potentialBlockerPositions.push({r,c});
        Phaser.Utils.Array.Shuffle(potentialBlockerPositions);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = startX + col * this.hexSize * 1.5;
                const y = startY + row * this.hexSize * Math.sqrt(3) + (col % 2) * (this.hexSize * Math.sqrt(3) / 2);
                
                const hex = this.add.graphics({ x, y });
                
                let isBlocker = false;
                if (blockersToPlace > 0) {
                    const currentPos = potentialBlockerPositions.pop()!;
                    if(currentPos.r === row && currentPos.c === col) {
                        isBlocker = true;
                        blockersToPlace--;
                    }
                }

                this.hexDataMap.set(hex, {
                    x: col, y: row, isPowerNode: false, isBlocker: isBlocker,
                    energyColor: null, connections: []
                });
                
                this.drawHex(hex, isBlocker ? this.blockerColor : 0xaaaaaa, isBlocker);
                this.grid.add(hex);
            }
        }
    }

    private drawHex(hexGraphics: Phaser.GameObjects.Graphics, color: number, isFilled: boolean = false,isSelected:boolean = false): void {
        const lineWidth = isSelected? 4 : 2;
        const alpha = isSelected? 1 : 0.7;
        hexGraphics.clear();
        hexGraphics.lineStyle(lineWidth, color, 1);
        if (isFilled) {
            hexGraphics.fillStyle(color, alpha);
        }
        
        const points = this.getHexPoints(0,0);
        hexGraphics.beginPath();
        hexGraphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) hexGraphics.lineTo(points[i].x, points[i].y);
        hexGraphics.closePath();
        if (isFilled) hexGraphics.fillPath();
        hexGraphics.strokePath();
    }

    private getHexPoints(x: number, y: number): Phaser.Geom.Point[] {
        const points: Phaser.Geom.Point[] = [];
        for (let i = 0; i < 6; i++) {
            const angle_deg = 60 * i - 30;
            const angle_rad = Phaser.Math.DEG_TO_RAD * angle_deg;
            points.push(new Phaser.Geom.Point(
                x + this.hexSize * Math.cos(angle_rad),
                y + this.hexSize * Math.sin(angle_rad)
            ));
        }
        return points;
    }
    
    private placePowerNodes(): void {
        const potentialNodes = Array.from(this.hexDataMap.keys()).filter(hex => !this.hexDataMap.get(hex)?.isBlocker);
        if (potentialNodes.length < 2) { return; }

        const player1Node = potentialNodes.splice(Math.floor(Math.random() * potentialNodes.length), 1)[0];
        const player2Node = potentialNodes.splice(Math.floor(Math.random() * potentialNodes.length), 1)[0];
        
        this.makePowerNode(player1Node, 0);
        this.makePowerNode(player2Node, 1);
    }

    private makePowerNode(hex: Phaser.GameObjects.Graphics, playerIndex: number): void {
        const data = this.hexDataMap.get(hex);
        if (data && !data.isBlocker) {
            data.isPowerNode = true;
            data.energyColor = this.playerColors[playerIndex];
            this.drawHex(hex, this.playerColors[playerIndex], true, true);
            this.powerNodes.push(hex);
        }
    }

    private handleTouchStart(pointer: Phaser.Input.Pointer): void {
        if (this.isAITurn || this.gameOver) return;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const hex = this.findHexAtPosition(worldPoint.x, worldPoint.y);
        
        if (hex) {
            const data = this.hexDataMap.get(hex);
            if (data && !data.isPowerNode && !data.isBlocker && data.energyColor === null) {
                this.selectedHex = hex;
                this.drawHex(hex, this.playerColors[this.currentPlayer], false, true);
            }
        }
    }

    private handleTouchEnd(): void {
        if (this.isAITurn || this.gameOver || !this.selectedHex) return;
        const hexToClaim = this.selectedHex;
        this.selectedHex = null;

        const data = this.hexDataMap.get(hexToClaim);
        if (data && !data.isPowerNode && !data.isBlocker && data.energyColor === null) {
            data.energyColor = this.playerColors[this.currentPlayer];
            this.drawHex(hexToClaim, this.playerColors[this.currentPlayer], true, false);
            this.updateScoreDisplay();
            
            const allHexesFilled = Array.from(this.hexDataMap.values())
                .every(hexData => hexData.isPowerNode || hexData.isBlocker || hexData.energyColor !== null);

            if (allHexesFilled) {
                this.determineWinner();
                return;
            }
            this.currentPlayer = 1;
            this.events.emit('playerChanged', this.currentPlayer);
        } else if (data) {
            this.drawHex(hexToClaim, data.isBlocker ? this.blockerColor : (data.energyColor || 0xaaaaaa), data.isBlocker || data.energyColor !== null, data.isPowerNode);
        }
    }

    private findHexAtPosition(x: number, y: number): Phaser.GameObjects.Graphics | null {
        let closestHex: Phaser.GameObjects.Graphics | null = null;
        let minDistance = this.hexSize;

        this.grid.getChildren().forEach((child) => {
            const hex = child as Phaser.GameObjects.Graphics;
            const distance = Phaser.Math.Distance.Between(x, y, hex.x, hex.y);
            if (distance < minDistance) {
                minDistance = distance;
                closestHex = hex;
            }
        });
        return closestHex;
    }

    private makeAIMove(): void {
        if (this.gameOver || !this.isAITurn) return;

        const possibleMoves = Array.from(this.hexDataMap.entries())
            .filter(([_, data]) => !data.isPowerNode && !data.isBlocker && data.energyColor === null);

        if (possibleMoves.length === 0) {
            this.determineWinner();
            return;
        }

        const bestMove = this.findBestMoveAI(possibleMoves);
        if (bestMove) {
            const [hex, data] = bestMove;
            data.energyColor = this.playerColors[1];
            this.drawHex(hex, this.playerColors[1], true, false);
            this.updateScoreDisplay();
            
            const allHexesFilled = Array.from(this.hexDataMap.values())
                .every(hData => hData.isPowerNode || hData.isBlocker || hData.energyColor !== null);

            if (allHexesFilled) {
                this.determineWinner();
                return;
            }
            this.currentPlayer = 0;
            this.isAITurn = false;
            this.events.emit('playerChanged', this.currentPlayer);
        } else {
            this.determineWinner();
        }
    }

    private findBestMoveAI(possibleMoves: [Phaser.GameObjects.Graphics, HexData][]): [Phaser.GameObjects.Graphics, HexData] | null {
        const aiColor = this.playerColors[1];
        const playerColor = this.playerColors[0];
    
        const simulateMoveAndGetCluster = (hex: Phaser.GameObjects.Graphics, color: number): number => {
            const data = this.hexDataMap.get(hex)!;
            const originalEnergyColor = data.energyColor;
            data.energyColor = color;
            const clusterSize = this.findLargestCluster(color, true);
            data.energyColor = originalEnergyColor;
            return clusterSize;
        };
    
        let bestOverallMove: [Phaser.GameObjects.Graphics, HexData] | null = null;
        let bestMoveScore = -Infinity;
    
        for (const [hex, data] of possibleMoves) {
            let currentMoveScore = 0;
    
            const aiClusterPotential = simulateMoveAndGetCluster(hex, aiColor);
            currentMoveScore += aiClusterPotential * 1.5;
    
            const playerClusterIfPlayerTookHex = simulateMoveAndGetCluster(hex, playerColor);
            const currentPlayerLargestCluster = this.findLargestCluster(playerColor, true);
            if (playerClusterIfPlayerTookHex > currentPlayerLargestCluster) {
                currentMoveScore += (playerClusterIfPlayerTookHex - currentPlayerLargestCluster) * 1.2;
            }
    
            const aiPowerNode = this.powerNodes[1];
            let minDistanceToFriendly = Infinity;
            
            Array.from(this.hexDataMap.entries()).forEach(([h, d]) => {
                if (d.energyColor === aiColor) {
                    const dist = Phaser.Math.Distance.Between(hex.x, hex.y, h.x, h.y);
                    if (dist < minDistanceToFriendly) minDistanceToFriendly = dist;
                }
            });
            if (aiPowerNode && (minDistanceToFriendly === Infinity || Phaser.Math.Distance.Between(hex.x, hex.y, aiPowerNode.x, aiPowerNode.y) < minDistanceToFriendly)) {
                 minDistanceToFriendly = Phaser.Math.Distance.Between(hex.x, hex.y, aiPowerNode.x, aiPowerNode.y);
            }
            if (minDistanceToFriendly !== Infinity) {
                currentMoveScore += (this.hexSize * 5 - minDistanceToFriendly) * 0.1;
            }

            if (currentMoveScore > bestMoveScore) {
                bestMoveScore = currentMoveScore;
                bestOverallMove = [hex, data];
            }
        }
        
        if (!bestOverallMove && possibleMoves.length > 0) {
            return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }
        return bestOverallMove;
    }

    private determineWinner(): void {
        this.gameOver = true;
        this.turnText.setText('GAME OVER').setColor('#ffffff');

        const playerCluster = this.findLargestCluster(this.playerColors[0]);
        const aiCluster = this.findLargestCluster(this.playerColors[1]);

        let winnerText: string;
        if (playerCluster > aiCluster) winnerText = 'You Win!';
        else if (aiCluster > playerCluster) winnerText = 'AI Wins!';
        else winnerText = "It's a Tie!";

        const goBg = this.add.rectangle(this.cameras.main.width/2, this.cameras.main.height/2, 400, 200, 0x000000, 0.8).setStrokeStyle(2, 0xffffff);
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 40, winnerText, {
            fontSize: '48px', color: '#00ff00', align: 'center' }).setOrigin(0.5);
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 10, 
            `Your Cluster: ${playerCluster} | AI Cluster: ${aiCluster}`,
            { fontSize: '20px', color: '#ffffff', align: 'center' }).setOrigin(0.5);

        const playAgainButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 60, 'Play Again?', {
            fontSize: '28px', color: '#ffffff', backgroundColor: '#008000',
            padding: { x: 15, y: 8 }, align: 'center'
        }).setOrigin(0.5).setInteractive();

        playAgainButton.on('pointerdown', () => this.scene.restart());
        playAgainButton.on('pointerover', () => playAgainButton.setStyle({ fill: '#00ff00' }));
        playAgainButton.on('pointerout', () => playAgainButton.setStyle({ fill: '#ffffff' }));
    }

    private findLargestCluster(color: number, useCurrentData: boolean = false): number {
        const visited = new Set<Phaser.GameObjects.Graphics>();
        let largestCluster = 0;
        const hexesToSearch = Array.from(this.hexDataMap.entries());

        for (const [hex, hexInfo] of hexesToSearch) {
            if (!hexInfo.isBlocker && hexInfo.energyColor === color && !visited.has(hex)) {
                const clusterSize = this.calculateClusterSize(hex, color, visited, useCurrentData);
                largestCluster = Math.max(largestCluster, clusterSize);
            }
        }
        return largestCluster;
    }

    private calculateClusterSize(startHex: Phaser.GameObjects.Graphics, color: number, visited: Set<Phaser.GameObjects.Graphics>, useCurrentDataForSim: boolean = false): number {
        const queue: Phaser.GameObjects.Graphics[] = [startHex];
        let clusterSize = 0;
        const sourceMap = useCurrentDataForSim ? this.hexDataMap : new Map(Array.from(this.hexDataMap.entries()).filter(([_,data])=>!data.isBlocker || data.energyColor === color)); 

        while (queue.length > 0) {
            const currentHex = queue.shift()!;
            const currentData = sourceMap.get(currentHex);

            if (!currentData || visited.has(currentHex) || currentData.energyColor !== color || currentData.isBlocker && currentData.energyColor !==color ) continue;
            
            visited.add(currentHex);
            clusterSize++;

            Array.from(sourceMap.entries()).forEach(([neighborHex, neighborData]) => {
                if (neighborData.energyColor === color && !visited.has(neighborHex) && (!neighborData.isBlocker || neighborData.energyColor === color )) {
                    const distance = Phaser.Math.Distance.Between(currentHex.x, currentHex.y, neighborHex.x, neighborHex.y);
                    if (distance < this.hexSize * 1.9) {
                        queue.push(neighborHex);
                    }
                }
            });
        }
        return clusterSize;
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game',
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1024,
        height: 768
    },
    scene: [PreloadScene, MenuScene, GameScene]
};

new Phaser.Game(config); 