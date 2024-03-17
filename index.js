let canvas;
let ctx;
let flowField;
let flowFieldAnimation;

window.onload = function() {
    canvas = document.getElementById('hero-background');
    ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    flowField = new FlowFieldEffect(ctx, canvas.width, canvas.height);
    flowField.animate(0);
}

window.addEventListener('resize', function() {
    this.cancelAnimationFrame(flowFieldAnimation);

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    flowField = new FlowFieldEffect(ctx, canvas.width, canvas.height);
    flowField.animate(0);
});

const mouse = {
    x: 0,
    y: 0
}
window.addEventListener('mousemove', function(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});

class FlowFieldEffect {
    #ctx;
    #width;
    #height;


    constructor(ctx, width, height) {
        this.#ctx = ctx;
        this.#ctx.strokeStyle = 'white';
        this.#ctx.lineWidth = 1;
        this.#width = width;
        this.#height = height;
        this.lastTime = 0;
        this.interval = 16;
        this.timer = 0;
        this.cellSize = 15;
        this.radius = 0;
        this.vr = 0.03;
        
        this.gradient;
        this.#createGradient();
        this.#ctx.strokeStyle = this.gradient;
    }

    #createGradient() {
        this.gradient = this.#ctx.createLinearGradient(0, 0, this.#width, this.#height);
        this.gradient.addColorStop(0, '#8e99dd');
        this.gradient.addColorStop(1, '#1a2c93');
    }

    #drawLine(angle, x,y) {
        let posX = x;
        let posY = y;

        let dx = mouse.x - posX;
        let dy = mouse.y - posY;

        let distance = (dx * dx) + (dy * dy);

        distance = Math.min(1000000, distance);
        distance = Math.max(50000, distance);

        const length = distance * 0.00001;

        this.#ctx.beginPath();
        this.#ctx.moveTo(x, y);
        this.#ctx.lineTo(x + length * Math.cos(angle), y + length * Math.sin(angle));
        this.#ctx.stroke();
    }

    animate(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        if(this.timer > this.interval) {
            this.#ctx.clearRect(0, 0, this.#width, this.#height);

            this.radius += this.vr;
            if(this.radius > 15 || this.radius < -15) {
                this.vr *= -1;
            }
            
            for(let y = 0; y < this.#height; y += this.cellSize) {
                for(let x = 0; x < this.#width; x += this.cellSize) {
                    const angle = (Math.cos(x * 0.01) + Math.sin(y * 0.01)) * this.radius;
                    this.#drawLine(angle, x, y);
                }
            }

            this.timer = 0;
        } else {
            this.timer += deltaTime;
        }
        flowFieldAnimation = requestAnimationFrame(this.animate.bind(this));
    }
}