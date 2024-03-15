describe("basic", () => {
    it("basic", function () {
        // console.log(this.currentTest?.file ?? this.test?.file)
        // console.log(this.test?.file)
        console.log(this)
        console.log("runnable" in this)
        console.log(typeof this.runnable)
    })
})
